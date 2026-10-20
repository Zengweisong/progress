const priorityRank = { high: 0, medium: 1, low: 2 };

function calendar(value = new Date()) {
  const parsed = new Date(value);
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
  }).formatToParts(safe);
  const part = name => parts.find(p => p.type === name)?.value || '';
  return {
    year: part('year'), month: part('month'), day: part('day'), weekday: part('weekday'),
    key: `${part('year')}-${part('month')}-${part('day')}`,
    label: `${Number(part('month'))} 月 ${Number(part('day'))} 日`,
  };
}

function visibleProjects(ctx) {
  return ctx.data.projects;
}

function visibleNotes(ctx) {
  return [...ctx.data.notes]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function filters(ctx, prefix) {
  return `<div class="fj-filters" role="group" aria-label="${prefix}项目筛选">${[
    ['all', '全部'], ['active', '未完成'], ['done', '已完成'],
  ].map(([id, label]) => `<button type="button" data-filter="${id}" aria-pressed="${(ctx.state.filter || 'all') === id}" class="${(ctx.state.filter || 'all') === id ? 'is-active' : ''}">${label}</button>`).join('')}</div>`;
}

function focusProject(ctx, project, index) {
  const { esc, pct, statusName, icon } = ctx;
  const completed = project.tasks.filter(task => task.done).length;
  const amount = pct(project);
  return `<button type="button" class="fj-project-card" data-project="${esc(project.id)}" aria-label="查看${esc(project.title)}，${amount}% 完成">
    <span class="fj-project-card-top"><span class="fj-project-number">${String(index + 1).padStart(2, '0')}</span><span class="fj-project-state fj-state-${esc(project.status)}"><i></i>${esc(statusName(project))}</span></span>
    <strong>${esc(project.title)}</strong>
    <span class="fj-project-category">${esc(project.tag || '我的项目')}</span>
    <span class="fj-mini-progress" role="img" aria-label="已完成 ${completed} / ${project.tasks.length} 项"><span style="width:${amount}%"></span></span>
    <span class="fj-project-card-bottom"><span>${completed} / ${project.tasks.length} 项</span><b>${amount}<small>%</small></b>${icon('arrow')}</span>
  </button>`;
}

export function renderFocus(ctx) {
  const { data, state, esc, icon, pct, statusName, taskRow, captureForm, recordList } = ctx;
  const today = calendar();
  const activeProjects = data.projects.filter(p => p.status !== 'done');
  const ordered = [...activeProjects].sort((a, b) => (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2));
  const project = ordered.find(p => p.id === state.selectedProject) || ordered[0] || data.projects[0];
  const pending = project?.tasks.filter(task => !task.done) || [];
  const completed = data.projects.reduce((total, p) => total + p.tasks.filter(task => task.done).length, 0);
  const total = data.projects.reduce((count, p) => count + p.tasks.length, 0);
  const overview = visibleProjects(ctx);
  const notes = visibleNotes(ctx);
  const ratio = project ? pct(project) : 0;
  return `<section class="view-focus">
    <header class="fj-focus-topline"><span class="fj-focus-wordmark">${icon('focus')} 拾序 <em>/</em> 专注台</span><span class="fj-focus-space"><i></i> 给重要的事，一点空间</span><button type="button" data-action="capture" class="fj-focus-capture">${icon('plus')} 随手记</button></header>
    <div class="fj-focus-content">
      <div class="fj-focus-heading"><div><p class="fj-eyebrow">${today.year} / ${today.month} / ${today.day} <span>${today.weekday}</span></p><h1>今天，往前一点。</h1><p class="fj-focus-subtitle">把下一步放在眼前，把想到的随手留下。</p></div><div class="fj-focus-summary"><span><strong>${data.projects.filter(p => p.status === 'active').length}</strong>进行中的项目</span><span><strong>${completed}<small> / ${total}</small></strong>已完成的行动</span></div></div>
      <div class="fj-focus-columns">
        <div class="fj-focus-primary">
          <section class="fj-next-card" aria-labelledby="fj-next-heading">
            <div class="fj-section-label"><span>${icon('bolt')} 优先推进</span><span>ONE THING AT A TIME</span></div>
            ${project ? `<div class="fj-next-overview"><div><span class="fj-next-tag">${esc(project.tag)} · ${esc(statusName(project))}</span><h2 id="fj-next-heading">${esc(project.title)}</h2><p>${esc(project.description)}</p></div><div class="fj-progress-orbit" style="--fj-progress:${ratio}%" role="img" aria-label="项目完成 ${ratio}%"><span><strong>${ratio}<small>%</small></strong><em>已完成</em></span></div></div>
            <div class="fj-next-actions"><div class="fj-small-heading"><h3>下一步行动</h3><span>${pending.length} 项待完成</span></div>${pending.length ? pending.slice(0, 3).map(task => taskRow(project, task)).join('') : '<p class="fj-empty">这里的行动都已完成。写下一个新想法吧。</p>'}</div>
            <footer class="fj-next-footer"><span>${project.due ? `计划完成 · ${esc(ctx.date(project.due))}` : '按自己的节奏推进'}</span><button type="button" data-project="${esc(project.id)}">打开项目 ${icon('arrow')}</button></footer>` : '<h2 id="fj-next-heading">从一个小行动开始</h2><p class="fj-empty">新的计划，随时可以开始。</p>'}
          </section>
          <section class="fj-focus-capture-section" aria-labelledby="fj-focus-record-heading"><div class="fj-section-heading"><div><span class="fj-eyebrow">LEAVE A LITTLE TRACE</span><h2 id="fj-focus-record-heading">想到了，就记下来。</h2></div><span class="fj-key-hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> 保存</span></div><div class="fj-compose fj-focus-compose">${captureForm({ id: 'focus-capture', placeholder: '刚刚完成了什么？有什么想法？', label: '留下此刻的想法' })}</div></section>
          <section class="fj-focus-notes" aria-labelledby="fj-focus-notes-heading"><div class="fj-small-heading"><h2 id="fj-focus-notes-heading">最近留下的想法</h2><span>${notes.length} 条记录</span></div>${recordList(notes, 3)}</section>
        </div>
        <aside class="fj-focus-overview" aria-labelledby="fj-focus-overview-heading"><div class="fj-section-heading"><div><span class="fj-eyebrow">THE BIG PICTURE</span><h2 id="fj-focus-overview-heading">也看见全局</h2></div><span class="fj-count">${String(data.projects.length).padStart(2, '0')}</span></div>${filters(ctx, '专注台')}<div class="fj-focus-projects">${overview.map((p, index) => focusProject(ctx, p, index)).join('') || '<p class="fj-empty">没有符合条件的项目。</p>'}</div><p class="fj-focus-footnote">${icon('check')} 每个小行动，都在让计划向前。</p></aside>
      </div>
    </div>
  </section>`;
}

function journalEntry(ctx, note, index) {
  const { esc, icon, data } = ctx;
  const associated = (note.projectIds || []).map(id => data.projects.find(p => p.id === id)).filter(Boolean);
  return `<article class="fj-journal-entry"><span class="fj-entry-marker" aria-hidden="true"></span><div class="fj-entry-meta"><span>${esc(note.category || '随手记')}</span><span>${String(index + 1).padStart(2, '0')}</span></div><button type="button" data-note="${esc(note.id)}" class="fj-entry-content"><h3>${esc(note.title)}</h3><p>${esc(note.summary || note.body?.replace(/^#+\s*/gm, '').slice(0, 130) || '打开记录，继续这段思考。')}</p><span class="fj-entry-open">展开这页 ${icon('arrow')}</span></button><footer class="fj-entry-footer">${associated.length ? associated.map(project => `<button type="button" data-project="${esc(project.id)}">${icon('link')}${esc(project.title)}</button>`).join('') : `<span>${icon('note')} 收集箱 · 尚未关联项目</span>`}</footer></article>`;
}

export function renderJournal(ctx) {
  const { data, esc, icon, captureForm, pct, statusName } = ctx;
  const today = calendar();
  const notes = visibleNotes(ctx);
  const groups = [];
  for (const note of notes) {
    const noteDate = calendar(note.updatedAt);
    let group = groups.find(item => item.key === noteDate.key);
    if (!group) { group = { ...noteDate, notes: [] }; groups.push(group); }
    group.notes.push(note);
  }
  const projects = visibleProjects(ctx);
  return `<section class="view-journal">
    <header class="fj-journal-masthead"><span class="fj-journal-brand">拾序<span>日常手记</span></span><span class="fj-journal-edition">A PERSONAL WORK JOURNAL</span><span class="fj-journal-issue">${today.year} · ${today.month}</span></header>
    <div class="fj-journal-grid">
      <aside class="fj-date-rail" aria-label="今天的日期"><span class="fj-date-month">${today.year} 年 ${Number(today.month)} 月</span><strong class="fj-date-day">${today.day}</strong><span class="fj-date-week">${today.weekday}</span><span class="fj-date-rule"></span><p>生活向前，<br>思考有迹。</p><button type="button" data-action="capture" class="fj-journal-write">${icon('plus')} 写一笔</button><span class="fj-date-index">${String(data.notes.length).padStart(2, '0')} 条记录<br>${String(data.projects.length).padStart(2, '0')} 个项目</span></aside>
      <div class="fj-journal-pages">
        <div class="fj-journal-heading"><span class="fj-eyebrow">THOUGHTS, NOTES & SMALL STEPS</span><h1>把今天，写成一页。</h1><p>从一条记录开始，让行动和思考慢慢连起来。</p></div>
        <section class="fj-journal-compose-section" aria-labelledby="fj-journal-compose-heading"><div class="fj-journal-compose-heading"><h2 id="fj-journal-compose-heading">此刻，有什么想留下？</h2><span>随时记录</span></div><div class="fj-compose fj-journal-compose">${captureForm({ id: 'journal-capture', placeholder: '一个念头，一点进展，或明天想做的事…', label: '写下这一刻' })}</div></section>
        <div class="fj-journal-feed-heading"><h2>记录的轨迹</h2><span>${notes.length} 条 · 按最近更新</span></div>
        <div class="fj-journal-timeline">${groups.map(group => `<section class="fj-journal-day"><div class="fj-journal-day-heading"><span>${group.key === today.key ? '今天' : group.label}</span><time datetime="${group.key}">${group.year}.${group.month}.${group.day}</time><span>${group.notes.length} 条</span></div>${group.notes.map((note, index) => journalEntry(ctx, note, index)).join('')}</section>`).join('') || '<p class="fj-empty">这里还没有记录。写下第一笔，让思路有迹可循。</p>'}</div>
        <footer class="fj-journal-end"><span></span> 随手留下，日后重逢。 <span></span></footer>
      </div>
      <aside class="fj-journal-index" aria-labelledby="fj-journal-index-heading"><div class="fj-journal-index-heading"><span class="fj-eyebrow">PROJECT INDEX</span><h2 id="fj-journal-index-heading">进行中的篇章</h2><p>记录回到项目，想法走向行动。</p></div>${filters(ctx, '手记')}<div class="fj-journal-project-list">${projects.map((project, index) => `<button type="button" class="fj-journal-project" data-project="${esc(project.id)}"><span class="fj-journal-project-title"><small>${String(index + 1).padStart(2, '0')}</small><strong>${esc(project.title)}</strong>${icon('arrow')}</span><span class="fj-journal-project-meta"><span>${esc(statusName(project))}</span><span>${pct(project)}%</span></span><span class="fj-mini-progress"><span style="width:${pct(project)}%"></span></span><span class="fj-journal-project-notes">${data.notes.filter(n => n.projectIds?.includes(project.id)).length} 条关联记录</span></button>`).join('') || '<p class="fj-empty">没有符合条件的项目。</p>'}</div><div class="fj-journal-margin-note">${icon('book')}<p>计划不必一次写完。<br>给下一步，留一点空白。</p></div></aside>
    </div>
  </section>`;
}
