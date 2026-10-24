export const blankNoteTitle = '未命名页面';

export const builtinTemplates = [
  { id: 'meeting', title: '会议记录', glyph: '🗒️', description: '议题、讨论与行动项', body: '## 会议信息\n\n日期：\n参与人：\n\n## 讨论议题\n\n- \n\n## 会议结论\n\n\n\n## 行动项\n\n- [ ] 负责人 · 事项 · 截止日期\n' },
  { id: 'weekly', title: '工作周报', glyph: '📝', description: '本周进展与下周计划', body: '## 本周进展\n\n- \n\n## 问题与思考\n\n- \n\n## 下周计划\n\n- [ ] \n' },
  { id: 'review', title: '项目复盘', glyph: '🏅', description: '回顾成果，沉淀经验', body: '## 项目目标\n\n\n\n## 实际成果\n\n- \n\n## 做得好的地方\n\n- \n\n## 可以改进的地方\n\n- \n\n## 下一步行动\n\n- [ ] \n' },
  { id: 'reading', title: '读书笔记', glyph: '📖', description: '摘录、理解与实践', body: '## 书籍信息\n\n书名：\n作者：\n\n## 触动我的摘录\n\n> \n\n## 我的理解\n\n\n\n## 实践与行动\n\n- [ ] \n' },
  { id: 'planning', title: '个人规划', glyph: '🎯', description: '把目标变成具体行动', body: '## 我的目标\n\n\n\n## 关键步骤\n\n- [ ] \n\n## 时间安排\n\n\n\n## 回顾与调整\n\n\n' },
];

export function defaultTemplates() {
  return builtinTemplates.map((template, order) => ({ ...template, order, updatedAt: '1970-01-01T00:00:00.000Z' }));
}

export function commonTemplates(saved = []) {
  const records = new Map(defaultTemplates().map(template => [template.id, template]));
  for (const template of saved) records.set(template.id, template);
  return [...records.values()].map((template, index) => ({ template, index })).sort((a, b) => (a.template.order ?? a.index) - (b.template.order ?? b.index) || a.index - b.index).map(({ template }) => ({ ...template, key: `builtin:${template.id}` }));
}

export function moveCommonTemplate(data, id, beforeId, timestamp) {
  const templates = commonTemplates(data.templates), from = templates.findIndex(template => template.id === id);
  if (templates.length > 100) throw new Error('模板数量已达上限，请先整理模板。');
  if (from < 0 || id === beforeId || (beforeId !== null && !templates.some(template => template.id === beforeId))) return false;
  const next = [...templates], [template] = next.splice(from, 1);
  next.splice(beforeId === null ? next.length : next.findIndex(template => template.id === beforeId), 0, template);
  if (next.every((template, index) => template.id === templates[index].id)) return false;
  data.templates = next.map(({ key, ...template }, order) => ({ ...template, order, updatedAt: template.order === order ? template.updatedAt : timestamp }));
  return true;
}

export function importCommonTemplates(current, incoming, makeId) {
  const templates = structuredClone(current);
  for (const template of incoming) {
    const existing = templates.find(item => item.id === template.id);
    if (!existing) templates.push(structuredClone(template));
    else if (['title', 'description', 'body', 'glyph'].some(key => existing[key] !== template[key])) templates.push({ ...structuredClone(template), id: makeId(), title: `${template.title.slice(0, 194)}（导入）`, order: templates.length });
  }
  return templates;
}

export function noteTemplates(notes, saved = []) {
  return [...commonTemplates(saved),
    ...notes.filter(note => note.isTemplate).map(note => ({ ...note, key: `note:${note.id}`, glyph: '📄', description: '我的模板' }))];
}

export function renderTemplateCards(templates, esc, action = 'apply-note-template', editable = false) {
  return templates.map(template => {
    const card = `<button type="button" class="note-template-card" data-action="${action}" data-template="${esc(template.key)}" aria-label="${action === 'apply-note-template' ? '使用模板' : '从模板新建'}：${esc(template.title)}"><span class="note-template-glyph" aria-hidden="true">${esc(template.glyph)}</span><span><strong>${esc(template.title)}</strong><small>${esc(template.description)}</small></span></button>`;
    return !editable || !template.key.startsWith('builtin:') ? card : `<div class="note-template-item" data-common-template="${esc(template.id)}">${card}<div class="note-template-actions"><button type="button" data-template-drag="${esc(template.id)}" aria-label="拖动模板：${esc(template.title)}" title="拖动排序；Alt + 方向键排序"><svg viewBox="0 0 18 18" aria-hidden="true"><path d="M6 4h.01M12 4h.01M6 9h.01M12 9h.01M6 14h.01M12 14h.01" stroke-width="3"/></svg></button><button type="button" data-action="edit-common-template" data-id="${esc(template.id)}" aria-label="编辑模板：${esc(template.title)}" title="编辑模板"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 3 4 4-9 9H4v-4zM11 5l4 4"/></svg></button></div></div>`;
  }).join('');
}

export function renderEmptyNoteTemplates(notes, esc, icon, saved = []) {
  return `<section class="note-empty-templates" aria-label="选择页面模板"><p>直接输入正文，也可以选择一个模板：</p><div class="note-template-grid">${renderTemplateCards(noteTemplates(notes, saved), esc, 'apply-note-template', true)}<button type="button" class="note-template-card" data-action="note-template-picker"><span class="note-template-glyph" aria-hidden="true">${icon('layout')}</span><span><strong>更多模板</strong><small>浏览全部页面模板</small></span></button></div></section>`;
}
