// Image bytes are immutable and committed before their localStorage references.
// The portable workspace used by backups and sync always contains the bytes.
export const WORKSPACE_BYTES = 32 * 1024 * 1024;
let opening;
const known = new Map();
const knownText = new Map();
let textOpening;

function textDatabase() {
  if (!textOpening) textOpening = new Promise((resolve, reject) => {
    const request = indexedDB.open('shixu-text-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('texts');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); textOpening = null; knownText.clear(); };
      resolve(db);
    };
    request.onerror = () => { textOpening = null; reject(request.error); };
    request.onblocked = () => { textOpening = null; reject(new Error('请关闭旧版页面后重试正文保存。')); };
  });
  return textOpening;
}

function textFields(workspace) {
  return [
    ...(workspace.notes || []).map(record => [record, 'body']),
    ...(workspace.templates || []).map(record => [record, 'body']),
    ...(workspace.projects || []).flatMap(record => [[record, 'description'], ...(record.tasks || []).map(task => [task, 'description'])]),
  ];
}

function pendingTexts(workspace) {
  const values = textFields(workspace).map(([record, field]) => record[field]).filter(value => typeof value === 'string' && value.length);
  // Small workspaces keep their existing, immediately durable representation.
  // Large workspaces spill text to immutable records, just like attachments.
  const large = values.reduce((size, value) => size + value.length, 0) > 128 * 1024;
  return [...new Set(values.filter(value => (large || value.length > 4096) && !knownText.has(value)))];
}

export const needsTextPersistence = workspace => pendingTexts(workspace).length > 0;

export async function persistWorkspaceContent(workspace) {
  const pending = pendingTexts(workspace);
  await persistAttachments(workspace);
  if (!pending.length) return;
  const entries = pending.map(value => [crypto.randomUUID(), value]);
  const db = await textDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('texts', 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('正文转存失败，原始副本仍保留在本机。'));
    for (const [id, value] of entries) tx.objectStore('texts').put(value, id);
  });
  // References are emitted only after the transaction commits.
  for (const [id, value] of entries) knownText.set(value, id);
}

function compactText(record, field) {
  const storageId = knownText.get(record[field]);
  if (!storageId) return record;
  const copy = { ...record, [`${field}StorageId`]: storageId };
  delete copy[field];
  return copy;
}

async function hydrateText(workspace) {
  const references = textFields(workspace).filter(([record, field]) => record[field] === undefined && record[`${field}StorageId`] !== undefined);
  if (!references.length) return;
  const db = await textDatabase();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction('texts', 'readonly'), loaded = [];
    tx.oncomplete = () => resolve(loaded);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('本机正文读取失败。'));
    for (const [record, field] of references) {
      const id = record[`${field}StorageId`];
      const request = tx.objectStore('texts').get(id);
      request.onsuccess = () => loaded.push([record, field, id, request.result]);
    }
  });
  let missing = false;
  for (const [record, field, id, value] of records) {
    record[field] = typeof value === 'string' ? value : '';
    delete record[`${field}StorageId`];
    if (typeof value === 'string') knownText.set(value, id); else missing = true;
  }
  if (missing) throw Object.assign(new Error('本机正文缺失，请从完整备份或账号恢复；已停止覆盖原始存储。'), { workspace });
}

function database() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open('shixu-attachments-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('images');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; known.clear(); };
      resolve(db);
    };
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => { opening = null; reject(new Error('请关闭旧版页面后重试图片保存。')); };
  });
  return opening;
}

export async function persistAttachments(workspace) {
  const pending = [...new Set(workspace.notes.flatMap(note => (note.attachments || []).map(asset => asset.data)))].filter(data => !known.has(data));
  if (!pending.length) return;
  const entries = await Promise.all(pending.map(async data => {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return [Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''), data];
  }));
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('图片保存失败，请导出当前笔记。'));
    for (const [key, data] of entries) tx.objectStore('images').put(data, key);
  });
  for (const [key, data] of entries) known.set(data, key);
}

export function serializeWorkspace(workspace) {
  return JSON.stringify({ ...workspace,
    projects: workspace.projects.map(project => ({ ...compactText(project, 'description'), tasks: project.tasks.map(task => compactText(task, 'description')) })),
    ...(workspace.templates ? { templates: workspace.templates.map(template => compactText(template, 'body')) } : {}),
    notes: workspace.notes.map(note => ({ ...compactText(note, 'body'),
    ...(note.attachments ? { attachments: note.attachments.map(asset => {
      const storageId = known.get(asset.data);
      if (!storageId) throw new Error('图片尚未保存，请稍后重试。');
      const { data, ...metadata } = asset;
      return { ...metadata, storageId };
    }) } : {}),
  })) });
}

export async function hydrateWorkspace(value) {
  let textError;
  try { await hydrateText(value); } catch (error) { if (!error.workspace) throw error; textError = error; }
  const assets = (value?.notes || []).flatMap(note => note.attachments || []).filter(asset => asset.storageId !== undefined && asset.data === undefined);
  if (!assets.length) { if (textError) throw textError; return value; } // Legacy backups need no IndexedDB to open.
  const db = await database();
  const loaded = await new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly'), records = [];
    tx.oncomplete = () => resolve(records);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('图片读取失败。'));
    for (const asset of assets) {
      const request = tx.objectStore('images').get(asset.storageId);
      request.onsuccess = () => records.push([asset, request.result]);
    }
  });
  const missing = new Set();
  for (const [asset, data] of loaded) {
    if (typeof data !== 'string') { missing.add(asset); continue; }
    known.set(data, asset.storageId);
    asset.data = data;
    delete asset.storageId;
  }
  if (missing.size) {
    // Keep textual records and all available images exportable without ever
    // committing this partial view over the original localStorage snapshot.
    for (const note of value.notes) if (note.attachments) note.attachments = note.attachments.filter(asset => !missing.has(asset));
    throw Object.assign(new Error('本机图片缺失，请从完整备份或账号恢复；当前文字仍可导出。'), { workspace: value });
  }
  if (textError) throw textError;
  return value;
}
