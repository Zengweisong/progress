const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = {
  local: '仅保存在本机', checking: '检查同步状态', 'signed-out': '登录以同步',
  'needs-connect': '选择同步工作区', syncing: '正在同步', synced: '已同步',
  pending: '等待同步', offline: '离线 · 本机保存', conflict: '有冲突待处理', error: '同步需要处理',
};
const symbol = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17H6a4 4 0 0 1-.5-8 6.5 6.5 0 0 1 12.4-1A4.5 4.5 0 0 1 19 17h-2M8 14l4-4 4 4M12 10v11"/></svg>';

export function syncButton() {
  return `<button type="button" class="sync-pill" data-action="account" data-sync-pill aria-label="账号与多端同步">${symbol}<span data-sync-label>仅保存在本机</span></button>`;
}

export function createSyncUI(client, { space = 'main' } = {}) {
  let status = client.getStatus(), authMode = 'login', bodyKey = '', busy = false, actionError = '';
  const scope = space === 'lab' ? '版面实验室' : '主工作区';
  const dialog = document.createElement('dialog');
  dialog.id = 'sync-dialog'; dialog.className = 'sync-dialog';
  dialog.setAttribute('aria-labelledby', 'sync-dialog-title');
  dialog.innerHTML = `<header class="sync-dialog-head"><div><span class="sync-eyebrow">SHIXU / ${esc(scope)}</span><h2 id="sync-dialog-title">账号与多端同步</h2></div><button class="sync-close" type="button" data-sync-action="close" aria-label="关闭账号与多端同步">×</button></header><div class="sync-dialog-content"><div class="sync-summary" role="status" aria-live="polite">${symbol}<div><strong data-sync-status></strong><p data-sync-detail></p></div></div><p class="sync-scope">${space === 'lab' ? '四种版面共用独立的实验室数据，与主工作区分开同步。' : '同步此主工作区的项目、任务和笔记。视图偏好保留在本机，版面实验室的数据独立保存。'}</p><div data-sync-body></div><p class="sync-error" data-sync-error role="alert" hidden></p><p class="sync-footnote">其他设备访问同一个服务地址，登录同一账号即可继续。断网时可继续记录，恢复连接后自动同步。</p></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('[data-sync-body]');

  function statusDetail() {
    if (status.state === 'needs-connect') return `已登录 ${status.user?.username || ''}。请先选择这台设备如何加入${scope}。`;
    if (status.state === 'conflict') return '其他设备也修改了相同内容，请比较后保留需要的版本。';
    if (status.state === 'pending') return '修改已保存在本机；保存草稿并结束编辑后继续同步。';
    if (status.state === 'offline') return status.pending ? '本机有待上传的修改，恢复连接后会重试。' : '暂时无法连接服务器，本机记录仍可使用。';
    if (status.state === 'checking' || status.state === 'syncing') return '正在与当前服务连接，请稍候。';
    if (status.user) {
      const time = status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('zh-CN', { hour12: false }) : '';
      return `${status.user.username}${time ? ` · 最近同步 ${time}` : ' · 此工作区已连接'}`;
    }
    return '登录后选择同步方式。本机内容不会在登录时自动上传。';
  }

  function authMarkup() {
    const register = authMode === 'register';
    return `<div class="sync-auth-tabs" role="group" aria-label="账号操作"><button type="button" data-sync-action="login-tab" aria-pressed="${!register}">登录</button><button type="button" data-sync-action="register-tab" aria-pressed="${register}" ${status.registrationAllowed ? '' : 'disabled'}>注册账号</button></div>${!status.registrationAllowed ? '<p class="sync-muted">此服务暂未开放注册，可使用已有账号登录。</p>' : ''}<form id="sync-auth-form" class="sync-auth-form"><label for="sync-username">账号<input id="sync-username" name="username" autocomplete="username" required minlength="3" maxlength="40" autocapitalize="none" spellcheck="false" placeholder="输入账号"></label><label for="sync-password">密码<input id="sync-password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required ${register ? 'minlength="10"' : ''} maxlength="128" placeholder="${register ? '至少 10 个字符' : '输入密码'}"></label>${register && status.registrationCodeRequired ? '<label for="sync-registration-code">注册邀请码<input id="sync-registration-code" name="registrationCode" autocomplete="off" required maxlength="256" placeholder="向服务管理员获取"></label>' : ''}<button type="submit" class="sync-primary">${register ? '创建账号' : '登录账号'}</button></form><div class="sync-actions"><button type="button" data-sync-action="export">导出数据与恢复备份</button></div>`;
  }

  function conflictMarkup() {
    const conflicts = status.conflicts || [];
    let current = {};
    try { current = JSON.parse(localStorage.getItem(space === 'lab' ? 'shixu-layout-lab-v1' : 'shixu.workspace.v1') || '{}'); } catch { /* A missing label must not hide the conflicting content. */ }
    const fieldNames = new Map((current.fields || []).map(field => [field.id, field.name]));
    const projectNames = new Map((current.projects || []).map(project => [project.id, project.title]));
    for (const item of conflicts) {
      for (const record of [item.base, item.remote, item.local]) {
        if (item.collection === 'fields' && record) fieldNames.set(record.id, record.name);
        if (item.collection === 'projects' && record) projectNames.set(record.id, record.title);
      }
    }
    const field = (label, value) => `<div class="sync-record-field"><dt>${esc(label)}</dt><dd>${esc(value === '' || value === undefined || value === null ? '未填写' : value)}</dd></div>`;
    const names = { projects: '项目', notes: '笔记', fields: '自定义属性', folders: '二级分类' };
    const statusNames = { planned: '待开始', active: '进行中', review: '待回顾', done: '已完成' };
    const priorityNames = { high: '高优先级', medium: '中优先级', low: '低优先级' };
    const typeNames = { text: '文本', number: '数字', date: '日期', checkbox: '复选框' };
    const colorNames = { blue: '蓝色', purple: '紫色', peach: '桃色', green: '绿色', amber: '琥珀色', gray: '灰色' };
    const iconNames = { layers: '图层', globe: '地球', pen: '画笔', book: '书本', mountain: '山峰', camera: '相机', code: '代码', layout: '版面' };
    function recordMarkup(record, item) {
      if (!record) return '<p class="sync-record-deleted">已删除</p>';
      if (item.collection === 'projects') {
        const customKeys = [...new Set([...Object.keys(item.local?.custom || {}), ...Object.keys(item.remote?.custom || {})])];
        const custom = customKeys.map((key, index) => field(fieldNames.get(key) || `自定义属性 ${index + 1}`, typeof record.custom?.[key] === 'boolean' ? record.custom[key] ? '已勾选' : '未勾选' : record.custom?.[key])).join('');
        const tasks = (record.tasks || []).map(task => `<li class="${task.done ? 'is-done' : ''}"><span aria-label="${task.done ? '已完成' : '未完成'}">${task.done ? '✓' : '○'}</span><span>${esc(task.title)}</span></li>`).join('');
        return `<dl class="sync-record">${field('项目名称', record.title)}${field('说明', record.description)}${field('状态', statusNames[record.status] || '未设状态')}${field('优先级', priorityNames[record.priority] || '未设优先级')}${field('分类', record.tag)}${field('截止日期', record.due)}${field('置顶', record.pinned ? '已置顶' : '未置顶')}${field('颜色 / 图标', `${colorNames[record.color] || '默认颜色'} / ${iconNames[record.icon] || '默认图标'}`)}${custom}<div class="sync-record-field"><dt>任务清单</dt><dd>${tasks ? `<ul class="sync-record-tasks">${tasks}</ul>` : '暂无任务'}</dd></div></dl>`;
      }
      if (item.collection === 'notes') {
        const related = (record.projectIds || []).map(id => projectNames.get(id) || '另一设备的关联项目');
        return `<dl class="sync-record">${field('笔记标题', record.title)}${field('正文', record.body)}${field('标签', (record.tags || []).join('、') || '无标签')}${field('分类', record.category)}${field('收藏', (record.favorite ?? record.inbox) ? '已收藏' : '未收藏')}${field('关联项目', related.join('、') || '未关联项目')}</dl>`;
      }
      if (item.collection === 'fields') return `<dl class="sync-record">${field('属性名称', record.name)}${field('属性类型', typeNames[record.type] || '未设类型')}</dl>`;
      if (item.collection === 'folders') return `<dl class="sync-record">${field('分类名称', record.name)}${field('所属位置', { projects: '我的项目', knowledge: '知识库', inbox: '收藏夹' }[record.section])}</dl>`;
      return `<dl class="sync-record">${field('内容', record.title || record.name || '记录已修改')}</dl>`;
    }
    return `<section class="sync-conflicts"><h3>比较冲突内容 <span>${conflicts.length} 项</span></h3><p class="sync-muted">未冲突的修改会自动合并。选择任一方式前，都会保留恢复备份。</p><div class="sync-conflict-list">${conflicts.map((item, i) => `<details ${i === 0 ? 'open' : ''}><summary><span class="sync-record-kind">${esc(names[item.collection] || '记录')}</span>${esc(item.local?.title || item.remote?.title || item.base?.title || item.local?.name || item.remote?.name || item.base?.name || `冲突 ${i + 1}`)}</summary><div class="sync-conflict-values"><div><strong>本机</strong><div class="sync-record-scroll" tabindex="0" aria-label="本机${esc(names[item.collection] || '记录')}内容">${recordMarkup(item.local, item)}</div></div><div><strong>云端</strong><div class="sync-record-scroll" tabindex="0" aria-label="云端${esc(names[item.collection] || '记录')}内容">${recordMarkup(item.remote, item)}</div></div></div></details>`).join('')}</div><div class="sync-actions vertical"><button type="button" class="sync-primary" data-sync-action="resolve-both">合并并保留冲突副本</button><button type="button" data-sync-action="resolve-local">以本机冲突项为准</button><button type="button" data-sync-action="resolve-remote">以云端冲突项为准</button></div></section>`;
  }

  function accountMarkup() {
    const connected = status.state !== 'needs-connect';
    return `${!connected ? `<section class="sync-connect"><h3>这台设备如何加入？</h3><button type="button" class="sync-choice" data-sync-action="connect-merge"><strong>同步本机工作区 <span>合并</span></strong><small>将本机记录加入账号，同时接收其他设备的内容。相同记录有冲突时由你选择。</small></button><button type="button" class="sync-choice" data-sync-action="connect-cloud"><strong>打开账号工作区 <span>切换</span></strong><small>使用账号已有内容。本机现有内容先保留为恢复备份，不上传到账号。</small></button><p class="sync-muted">新设备建议打开账号工作区；需要保留这台设备上的记录时选择合并。</p></section>` : status.state === 'conflict' ? conflictMarkup() : `<div class="sync-connected"><span class="sync-account-avatar">${esc((status.user?.username || '我').slice(0, 1).toUpperCase())}</span><div><strong>${esc(status.user?.username)}</strong><span>${esc(scope)} · 自动同步已连接</span></div><button type="button" data-sync-action="sync">立即同步</button></div>`}<div class="sync-actions"><button type="button" data-sync-action="export">导出数据与恢复备份</button>${!status.pending && status.state !== 'conflict' && status.state !== 'syncing' ? '<button type="button" data-sync-action="logout">退出账号</button>' : ''}</div><p class="sync-muted">退出后，这台设备上的记录仍会保留。共用设备请妥善保管本机数据。</p>${status.pending || status.state === 'conflict' ? '<p class="sync-muted">仍有未同步修改，退出暂不可用。请先完成同步；也可以导出备份保存当前内容。</p>' : ''}`;
  }

  function refresh(next = client.getStatus()) {
    status = next;
    document.querySelectorAll('[data-sync-pill]').forEach(el => {
      el.dataset.syncState = status.state;
      el.querySelector('[data-sync-label]').textContent = labels[status.state] || '查看同步状态';
      el.title = `${scope} · ${statusDetail()}`;
    });
    dialog.querySelector('[data-sync-status]').textContent = labels[status.state] || '查看同步状态';
    dialog.querySelector('[data-sync-detail]').textContent = statusDetail();
    dialog.querySelector('.sync-summary').dataset.syncState = status.state;
    const view = status.user ? status.state === 'needs-connect' ? 'connect' : status.state === 'conflict' ? 'conflicts' : 'connected' : 'auth';
    const nextKey = JSON.stringify([view, status.user?.id, authMode, status.registrationAllowed, status.registrationCodeRequired, status.pending, status.state === 'syncing', status.conflicts]);
    if (nextKey !== bodyKey) {
      // Connection checks never replace a partially entered login/password form.
      const preserve = view === 'auth' && body.querySelector('#sync-auth-form');
      const draft = preserve ? new FormData(body.querySelector('#sync-auth-form')) : null;
      const activeId = dialog.contains(document.activeElement) ? document.activeElement.id : '';
      body.innerHTML = status.user ? accountMarkup() : authMarkup(); bodyKey = nextKey;
      if (draft) for (const [name, value] of draft) { const field = body.querySelector(`[name="${name}"]`); if (field) field.value = value; }
      if (activeId) body.querySelector(`#${activeId}`)?.focus({ preventScroll: true });
    }
    const error = actionError || status.error || '';
    const errorEl = dialog.querySelector('[data-sync-error]'); errorEl.textContent = error; errorEl.hidden = !error;
    body.querySelectorAll('button').forEach(button => { button.disabled = busy || (button.dataset.syncAction === 'register-tab' && !status.registrationAllowed); });
    body.setAttribute('aria-busy', String(busy));
  }

  async function run(action) {
    if (busy) return;
    busy = true; actionError = ''; refresh();
    try { await action(); }
    catch (error) { actionError = error?.message || '操作未完成，请重试。'; }
    finally { busy = false; refresh(); }
  }

  async function exportBackup() {
    const backup = await client.exportRecovery();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `拾序-${scope}-同步恢复备份-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  dialog.addEventListener('click', event => {
    event.stopPropagation();
    const action = event.target.closest('[data-sync-action]')?.dataset.syncAction;
    if (!action) return;
    if (action === 'close') { dialog.close(); return; }
    if (busy) return;
    if (action.endsWith('-tab')) { authMode = action === 'register-tab' ? 'register' : 'login'; actionError = ''; refresh(); return; }
    const actions = {
      sync: () => client.syncNow(), logout: () => client.logout(), export: exportBackup,
      'connect-merge': () => client.connect('merge'), 'connect-cloud': () => client.connect('cloud'),
      'resolve-both': () => client.resolveConflicts('both'), 'resolve-local': () => client.resolveConflicts('local'), 'resolve-remote': () => client.resolveConflicts('remote'),
    };
    if (actions[action]) void run(actions[action]);
  });
  dialog.addEventListener('submit', event => {
    event.preventDefault(); event.stopPropagation();
    if (event.target.id !== 'sync-auth-form' || busy || !event.target.reportValidity()) return;
    const values = new FormData(event.target);
    void run(async () => {
      const username = String(values.get('username')).trim(), password = String(values.get('password'));
      if (authMode === 'register') await client.register(username, password, String(values.get('registrationCode') || ''));
      else await client.login(username, password);
    });
  });
  for (const name of ['keydown', 'input', 'change']) dialog.addEventListener(name, event => event.stopPropagation());
  dialog.addEventListener('close', () => { const password = dialog.querySelector('[name="password"]'); if (password) password.value = ''; });
  refresh();
  return {
    open() { actionError = ''; refresh(); if (!dialog.open) dialog.showModal(); },
    refresh,
    destroy() { dialog.remove(); },
  };
}
