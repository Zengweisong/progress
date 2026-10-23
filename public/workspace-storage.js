// Image bytes are immutable and committed before their localStorage references.
// The portable workspace used by backups and sync always contains the bytes.
export const WORKSPACE_BYTES = 32 * 1024 * 1024;
let opening;
const known = new Map();

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
  return JSON.stringify({ ...workspace, notes: workspace.notes.map(note => ({ ...note,
    ...(note.attachments ? { attachments: note.attachments.map(asset => {
      const storageId = known.get(asset.data);
      if (!storageId) throw new Error('图片尚未保存，请稍后重试。');
      const { data, ...metadata } = asset;
      return { ...metadata, storageId };
    }) } : {}),
  })) });
}

export async function hydrateWorkspace(value) {
  const assets = (value?.notes || []).flatMap(note => note.attachments || []).filter(asset => asset.storageId !== undefined && asset.data === undefined);
  if (!assets.length) return value; // Legacy backups need no IndexedDB to open.
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
  return value;
}
