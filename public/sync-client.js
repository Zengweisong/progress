import { validateData } from './data.js';
import { emptyWorkspace, equalData, mergeWorkspaces, resolveWorkspaceConflicts } from './sync-merge.js';
import { getSyncMeta, putSyncMeta, getRecovery, archiveWorkspace } from './sync-db.js';
import { hydrateWorkspace } from './workspace-storage.js';

const SPACE_KEYS = { main: 'shixu.workspace.v1', lab: 'shixu-layout-lab-v1' };
const clone = value => structuredClone(value);
const blankMeta = () => ({ version: 1, ownerId: null, user: null, baseRevision: 0, baseData: null, conflict: null, lastSyncedAt: null });

export function createSyncClient({ space, storageKey, getData, applyData, canSync = () => true, onStatus = () => {}, freshLocal = false, pollInterval = 15000 }) {
  if (!Object.hasOwn(SPACE_KEYS, space) || SPACE_KEYS[space] !== storageKey) throw new Error('未知的同步空间。');
  let meta = blankMeta(), user = null, ready = false, stopped = false, running = null, operating = false, bindingChanged = false, timer, poll, generation = 0, epoch = 0;
  let status = { state: 'local', user: null, lastSyncedAt: null, pending: false, conflicts: [], error: '', registrationAllowed: false, registrationCodeRequired: false, space };
  const subscribers = new Set([onStatus]);
  const snapshot = () => validateData(clone(getData()));
  const pending = () => Boolean(meta.ownerId && (!meta.baseData || !equalData(snapshot(), meta.baseData)));
  const getStatus = () => clone(status);
  function emit(state, error = '', pendingOverride) {
    status = { ...status, state, user, ownerId: meta.ownerId, lastSyncedAt: meta.lastSyncedAt, pending: pendingOverride ?? pending(), conflicts: clone(meta.conflict?.conflicts || []), error };
    for (const callback of subscribers) callback(getStatus());
  }
  async function persist(next) {
    try { await putSyncMeta(space, next, { ownerId: meta.ownerId ?? null, transition: Boolean(meta.transition) }); }
    catch (error) {
      if (error.code === 'sync_owner_changed') {
        bindingChanged = true; freshLocal = true;
        await refreshOwnership();
        emit('needs-connect', error.message);
      }
      throw error;
    }
    meta = clone(next);
  }
  async function refreshOwnership() {
    const stored = await getSyncMeta(space);
    if (stored && (stored.version !== 1 || (stored.baseData && !validateData(clone(stored.baseData))))) throw new Error('同步记录无法读取，请先导出备份。');
    if ((stored?.ownerId ?? null) !== (meta.ownerId ?? null) || Boolean(stored?.transition) !== Boolean(meta.transition) || stored?.transition) {
      // Do not infer ownership of this tab's in-memory records from another
      // tab's metadata. Reconnecting may replace them, but must never upload them.
      meta = stored ? clone(stored) : blankMeta();
      bindingChanged = true; freshLocal = true;
      emit('needs-connect', '另一窗口已切换工作区。请刷新页面，或重新打开账号工作区；当前内容可先导出。');
      return false;
    }
    return !bindingChanged;
  }
  async function request(path, { method = 'GET', body } = {}) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(`/api/${path}`, {
        method, credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: { Accept: 'application/json', 'X-Shixu-Templates': '1', ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Shixu-Request': '1' } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let result;
      try { result = await response.json(); } catch { throw Object.assign(new Error('同步服务未正确响应，请检查服务器是否已更新。'), { status: response.status }); }
      if (!response.ok) throw Object.assign(new Error(result.error || '同步请求失败，请稍后重试。'), { status: response.status, code: result.code, detail: result });
      return result;
    } finally { clearTimeout(timeout); }
  }
  function verifyRemote(value) {
    if (value?.userId && value.userId !== user?.id) throw Object.assign(new Error('另一窗口已切换账号，本机内容已保留。'), { code: 'account_changed' });
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error('服务器返回的版本不匹配，同步已停止。');
    if (value.data) value.data = validateData(clone(value.data));
    return value;
  }
  function failed(error) {
    if (error.status === 401 || error.code === 'account_changed') { user = null; emit('signed-out', '登录状态已变化，本机修改会保留，请重新登录。'); }
    else if (error.code === 'sync_owner_changed') { bindingChanged = true; freshLocal = true; emit('needs-connect', error.message); }
    else if (error.name === 'AbortError' || error instanceof TypeError || !navigator.onLine) emit('offline', '暂时无法连接服务器，联网后会自动重试。');
    else emit('error', error.message || '同步失败，本机内容已保留。');
  }
  function schedule(delay = 650) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => { syncNow().catch(() => {}); }, delay);
  }
  function localChanged() {
    generation += 1;
    if (!ready || stopped) return;
    // A local edit already tells us that work is pending. Comparing the entire
    // workspace here would clone and validate every image on each keystroke.
    // syncNow and logout still perform the full semantic comparison.
    const changed = Boolean(meta.ownerId);
    if (!user) { emit(navigator.onLine ? 'signed-out' : 'offline', '', changed); return; }
    if (meta.ownerId !== user.id || freshLocal || meta.transition || bindingChanged) { emit('needs-connect', '', changed); return; }
    if (meta.conflict) { emit('conflict', '', changed); return; }
    emit(navigator.onLine ? 'pending' : 'offline', '', true); schedule();
  }
  async function apply(next) {
    if (!canSync()) throw new Error('请先完成当前编辑并确保本机保存成功，再继续同步。');
    const value = validateData(clone(next));
    if (await applyData(value) === false) throw new Error('新内容尚未写入本机，同步已暂停，请导出当前记录。');
  }
  async function fetchSession() {
    const response = await request('session');
    user = response.user || null;
    status.registrationAllowed = Boolean(response.registrationAllowed);
    status.registrationCodeRequired = Boolean(response.registrationCodeRequired);
    return user;
  }
  async function start() {
    if (ready || stopped) return;
    emit('checking');
    try {
      const stored = await getSyncMeta(space);
      if (stored) {
        if (stored.version !== 1 || (stored.baseData && !validateData(clone(stored.baseData)))) throw new Error('同步记录无法读取，请先导出备份。');
        meta = stored;
        if (meta.transition) freshLocal = true;
      }
      ready = true;
      await fetchSession();
      if (!user) emit('signed-out');
      else if (meta.ownerId !== user.id || freshLocal) emit('needs-connect');
      else if (meta.conflict) emit('conflict');
      else await syncNow();
    } catch (error) { failed(error); }
    if (ready && !stopped) {
      poll = setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, pollInterval);
      window.addEventListener('online', online);
      window.addEventListener('offline', offline);
      window.addEventListener('focus', online);
      document.addEventListener('visibilitychange', visible);
      if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
  const online = () => { schedule(0); };
  const offline = () => { if (meta.ownerId) emit('offline'); };
  const visible = () => { if (document.visibilityState === 'visible') schedule(0); };
  async function exclusive(work) {
    if (operating) throw new Error('请等待当前账号操作完成。');
    operating = true; epoch += 1; clearTimeout(timer);
    try { if (running) await running; return await work(); }
    finally { operating = false; schedule(0); }
  }
  function assertStable(expectedEpoch, localGeneration, local) {
    if (expectedEpoch !== epoch || localGeneration !== generation || !canSync() || !equalData(snapshot(), local)) throw new Error('内容已发生变化，请完成编辑后重试。');
  }
  async function authenticate(path, username, password, registrationCode = '') {
    if (!ready) throw new Error('同步记录尚未准备好，请稍后重试或刷新页面。');
    if (meta.ownerId && (pending() || meta.conflict) && user) throw new Error('有尚未同步的修改，请先同步或处理冲突，再切换账号。');
    epoch += 1;
    const result = await request(path, { method: 'POST', body: { username, password, ...(registrationCode ? { registrationCode } : {}) } });
    user = result.user;
    if (!user?.id) throw new Error('登录响应不完整，请重试。');
    if (meta.ownerId === user.id && !freshLocal) {
      if (meta.conflict) emit('conflict');
      else { emit('pending'); schedule(0); }
    } else emit('needs-connect');
    return getStatus();
  }
  const login = (username, password) => exclusive(() => authenticate('login', username, password));
  const register = (username, password, registrationCode) => exclusive(() => authenticate('register', username, password, registrationCode));
  async function connectWorkspace(mode) {
    if (!['merge', 'cloud'].includes(mode) || !user) throw new Error('请先登录账号。');
    await refreshOwnership();
    if (mode === 'merge' && meta.transition) throw new Error('上次切换未完成。请先打开账号工作区；切换前的内容保存在恢复备份中。');
    if (mode === 'merge' && bindingChanged) throw new Error('另一窗口已切换工作区。请刷新页面或打开账号工作区，避免把不同账号的记录混合。');
    if (mode === 'merge' && meta.ownerId && meta.ownerId !== user.id) throw new Error('本机内容属于另一个账号。请打开当前账号工作区，原账号内容会留在恢复备份中。');
    if (!canSync()) throw new Error('请先完成当前编辑再连接工作区。');
    const expectedEpoch = ++epoch, localGeneration = generation, local = snapshot();
    const remote = verifyRemote(await request(`workspace?space=${space}`));
    if (expectedEpoch !== epoch || localGeneration !== generation) throw new Error('内容已发生变化，请重新选择连接方式。');
    await archiveWorkspace(space, meta.ownerId, '连接账号之前的本机工作区', local);
    assertStable(expectedEpoch, localGeneration, local);
    const remoteData = remote.data || emptyWorkspace();
    const baseMeta = { ...blankMeta(), ownerId: user.id, user: clone(user), baseRevision: remote.revision, baseData: clone(remoteData) };
    if (mode === 'cloud') {
      const next = { ...clone(remoteData), preferences: clone(local.preferences) };
      // Mark a workspace switch before writing localStorage. If the page closes
      // between the two stores, next startup requires an explicit reconnect.
      await persist({ ...meta, transition: true });
      freshLocal = true;
      assertStable(expectedEpoch, localGeneration, local);
      await apply(next);
      await persist({ ...baseMeta, lastSyncedAt: new Date().toISOString() });
      freshLocal = false; bindingChanged = false; emit(pending() ? 'pending' : 'synced'); return;
    }
    const merged = mergeWorkspaces(emptyWorkspace(), local, remoteData);
    if (merged.conflicts.length) {
      await persist({ ...baseMeta, baseData: emptyWorkspace(), conflict: { base: emptyWorkspace(), local, remote, conflicts: merged.conflicts } });
      freshLocal = false; bindingChanged = false; emit('conflict'); return;
    }
    await persist({ ...meta, transition: true });
    freshLocal = true;
    assertStable(expectedEpoch, localGeneration, local);
    await apply(merged.data);
    await persist(baseMeta);
    freshLocal = false; bindingChanged = false; emit('pending'); await syncNow();
  }
  async function runSync() {
    if (!ready || stopped) return;
    try { if (!await refreshOwnership()) return; }
    catch (error) { failed(error); return; }
    if (!user) {
      if (!navigator.onLine) { emit('offline'); return; }
      try { await fetchSession(); } catch (error) { failed(error); return; }
      if (!user) { emit('signed-out'); return; }
    }
    if (meta.ownerId !== user.id || freshLocal) { emit('needs-connect'); return; }
    if (meta.conflict) { emit('conflict'); return; }
    if (!navigator.onLine) { emit('offline'); return; }
    if (!canSync()) { emit('pending', '等待当前编辑完成后同步。'); return; }
    const expectedEpoch = epoch;
    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const localGeneration = generation, local = snapshot();
        emit('syncing');
        const remote = verifyRemote(await request(`workspace?space=${space}`));
        if (expectedEpoch !== epoch || stopped) return;
        if (!await refreshOwnership()) return;
        if (localGeneration !== generation || !canSync() || !equalData(snapshot(), local)) continue;
        const remoteData = remote.data || emptyWorkspace(), base = meta.baseData || emptyWorkspace();
        const merged = mergeWorkspaces(base, local, remoteData);
        if (merged.conflicts.length) {
          await persist({ ...meta, conflict: { base: clone(base), local, remote, conflicts: merged.conflicts } });
          emit('conflict'); return;
        }
        if (!equalData(local, merged.data)) await apply(merged.data);
        if (expectedEpoch !== epoch || stopped) return;
        let confirmed = remote;
        if (!equalData(merged.data, remoteData)) {
          try { confirmed = verifyRemote(await request(`workspace?space=${space}`, { method: 'PUT', body: { expectedUserId: user.id, expectedRevision: remote.revision, data: merged.data } })); }
          catch (error) { if (error.status === 409 && error.code === 'revision_conflict') continue; throw error; }
        }
        if (expectedEpoch !== epoch || stopped) return;
        if (!await refreshOwnership()) return;
        await persist({ ...meta, baseRevision: confirmed.revision, baseData: clone(confirmed.data || emptyWorkspace()), lastSyncedAt: new Date().toISOString(), conflict: null, user: clone(user) });
        if (generation !== localGeneration || pending()) { emit('pending'); continue; }
        emit('synced'); return;
      }
      emit('pending', '内容正在变化，稍后会自动继续同步。'); schedule(1000);
    } catch (error) { failed(error); }
  }
  function syncNow() {
    clearTimeout(timer);
    if (operating) return Promise.resolve();
    if (!running) running = runSync().finally(() => { running = null; });
    return running;
  }
  async function resolveWorkspace(choice) {
    await refreshOwnership();
    if (!user || meta.ownerId !== user.id || freshLocal || meta.transition || bindingChanged) throw new Error('工作区连接尚未确认，请先刷新页面或打开账号工作区，再处理冲突。');
    if (!['local', 'remote', 'both'].includes(choice) || !meta.conflict || !user) throw new Error('当前没有需要处理的同步冲突。');
    if (!canSync()) throw new Error('请先完成当前编辑，再处理冲突。');
    const expectedEpoch = ++epoch, localGeneration = generation, local = snapshot();
    const remote = verifyRemote(await request(`workspace?space=${space}`));
    if (expectedEpoch !== epoch || localGeneration !== generation) throw new Error('内容已更新，请重新处理冲突。');
    const remoteData = remote.data || emptyWorkspace();
    const result = resolveWorkspaceConflicts(meta.conflict.base, local, remoteData, choice);
    const resolved = result.data || result;
    await archiveWorkspace(space, user.id, '处理冲突前的本机版本', local);
    await archiveWorkspace(space, user.id, '处理冲突前的服务器版本', remoteData);
    assertStable(expectedEpoch, localGeneration, local);
    await apply(resolved);
    await persist({ ...meta, baseData: clone(remoteData), baseRevision: remote.revision, conflict: null });
    emit('pending'); await syncNow();
  }
  async function logoutSession() {
    if (running) await running;
    if (pending() || meta.conflict || meta.transition) throw new Error('还有未同步的修改或未完成的切换。请先完成同步，再退出账号。');
    for (const [otherSpace, key] of Object.entries(SPACE_KEYS)) {
      if (otherSpace === space) continue;
      const other = await getSyncMeta(otherSpace), raw = localStorage.getItem(key);
      if (other?.ownerId === user?.id && (other.conflict || other.transition || (raw && (!other.baseData || !equalData(validateData(await hydrateWorkspace(JSON.parse(raw))), other.baseData))))) throw new Error('另一个工作区还有未同步的修改，请先打开该工作区完成同步。');
    }
    await request('logout', { method: 'POST', body: {} });
    epoch += 1; user = null; emit('signed-out');
  }
  async function exportRecovery() {
    return { format: 'shixu-sync-recovery-v1', exportedAt: new Date().toISOString(), space, current: snapshot(), baseline: clone(meta.baseData), conflict: clone(meta.conflict), archives: await getRecovery(space) };
  }
  const connect = mode => exclusive(() => connectWorkspace(mode));
  const resolveConflicts = choice => exclusive(() => resolveWorkspace(choice));
  const logout = () => exclusive(logoutSession);
  function subscribe(callback) { subscribers.add(callback); callback(getStatus()); return () => subscribers.delete(callback); }
  function destroy() {
    stopped = true; epoch += 1; clearTimeout(timer); clearInterval(poll);
    window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener('focus', online); document.removeEventListener('visibilitychange', visible);
  }
  return { start, localChanged, getStatus, subscribe, login, register, connect, syncNow, logout, resolveConflicts, exportRecovery, destroy };
}
