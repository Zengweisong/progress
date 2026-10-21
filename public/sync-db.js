const DATABASE = 'shixu-sync-v1';
let opening;

function openDatabase() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('spaces');
      const recovery = request.result.createObjectStore('recovery', { keyPath: 'id' });
      recovery.createIndex('space', 'space');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = null; reject(request.error); };
    request.onblocked = () => { opening = null; reject(new Error('请关闭旧版页面后重试同步。')); };
  });
  return opening;
}
async function transaction(store, mode, work) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), objectStore = tx.objectStore(store);
    let value;
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('同步数据保存失败。'));
    try { const request = work(objectStore); if (request) request.onsuccess = () => { value = request.result; }; }
    catch (error) { tx.abort(); reject(error); }
  });
}
export const getSyncMeta = space => transaction('spaces', 'readonly', store => store.get(space));
export async function putSyncMeta(space, value, expectedBinding) {
  if (!expectedBinding) return transaction('spaces', 'readwrite', store => store.put(structuredClone(value), space));
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('spaces', 'readwrite'), store = tx.objectStore('spaces');
    let failure;
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('同步数据保存失败。'));
    const request = store.get(space);
    request.onsuccess = () => {
      const current = request.result;
      if ((current?.ownerId ?? null) !== expectedBinding.ownerId || Boolean(current?.transition) !== expectedBinding.transition) {
        failure = Object.assign(new Error('另一窗口已切换工作区，请刷新页面或重新打开账号工作区。'), { code: 'sync_owner_changed' });
        tx.abort();
        return;
      }
      try { store.put(structuredClone(value), space); }
      catch (error) { failure = error; tx.abort(); }
    };
  });
}
export const getRecovery = space => transaction('recovery', 'readonly', store => store.index('space').getAll(space));
export const getRecoveryEntry = id => transaction('recovery', 'readonly', store => store.get(id));
export async function getTrashEntries(space, userId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recovery', 'readonly'), entries = [];
    tx.oncomplete = () => resolve(entries);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('回收站读取失败。'));
    const request = tx.objectStore('recovery').index('space').openCursor(space);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value;
      if (record.kind === 'trash' && record.userId === userId) {
        const { data, ...metadata } = record;
        // Listing deleted records needs identities, not every historical image.
        entries.push({ ...metadata, data: { kind: data.kind, projectId: data.projectId, record: { id: data.record.id } } });
      }
      cursor.continue();
    };
  });
}
export const deleteRecovery = id => transaction('recovery', 'readwrite', store => store.delete(id));
export async function archiveWorkspace(space, userId, label, data, kind = 'snapshot') {
  const record = { id: crypto.randomUUID(), space, userId, label, kind, createdAt: new Date().toISOString(), data: structuredClone(data) };
  await transaction('recovery', 'readwrite', store => store.put(record));
  return record;
}
