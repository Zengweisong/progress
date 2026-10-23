export const blankNoteTitle = '未命名页面';

export const builtinTemplates = [
  { id: 'meeting', title: '会议记录', glyph: '🗒️', description: '议题、讨论与行动项', body: '## 会议信息\n\n日期：\n参与人：\n\n## 讨论议题\n\n- \n\n## 会议结论\n\n\n\n## 行动项\n\n- [ ] 负责人 · 事项 · 截止日期\n' },
  { id: 'weekly', title: '工作周报', glyph: '📝', description: '本周进展与下周计划', body: '## 本周进展\n\n- \n\n## 问题与思考\n\n- \n\n## 下周计划\n\n- [ ] \n' },
  { id: 'review', title: '项目复盘', glyph: '🏅', description: '回顾成果，沉淀经验', body: '## 项目目标\n\n\n\n## 实际成果\n\n- \n\n## 做得好的地方\n\n- \n\n## 可以改进的地方\n\n- \n\n## 下一步行动\n\n- [ ] \n' },
  { id: 'reading', title: '读书笔记', glyph: '📖', description: '摘录、理解与实践', body: '## 书籍信息\n\n书名：\n作者：\n\n## 触动我的摘录\n\n> \n\n## 我的理解\n\n\n\n## 实践与行动\n\n- [ ] \n' },
  { id: 'planning', title: '个人规划', glyph: '🎯', description: '把目标变成具体行动', body: '## 我的目标\n\n\n\n## 关键步骤\n\n- [ ] \n\n## 时间安排\n\n\n\n## 回顾与调整\n\n\n' },
];

export function noteTemplates(notes) {
  return [...builtinTemplates.map(template => ({ ...template, key: `builtin:${template.id}` })),
    ...notes.filter(note => note.isTemplate).map(note => ({ ...note, key: `note:${note.id}`, glyph: '📄', description: '我的模板' }))];
}

export function renderTemplateCards(templates, esc, action = 'apply-note-template') {
  return templates.map(template => `<button type="button" class="note-template-card" data-action="${action}" data-template="${esc(template.key)}" aria-label="${action === 'apply-note-template' ? '使用模板' : '从模板新建'}：${esc(template.title)}"><span class="note-template-glyph" aria-hidden="true">${template.glyph}</span><span><strong>${esc(template.title)}</strong><small>${esc(template.description)}</small></span></button>`).join('');
}

export function renderEmptyNoteTemplates(notes, esc, icon) {
  return `<section class="note-empty-templates" aria-label="选择页面模板"><p>直接输入正文，也可以选择一个模板：</p><div class="note-template-grid">${renderTemplateCards(noteTemplates(notes), esc)}<button type="button" class="note-template-card" data-action="note-template-picker"><span class="note-template-glyph" aria-hidden="true">${icon('layout')}</span><span><strong>更多模板</strong><small>浏览全部页面模板</small></span></button></div></section>`;
}
