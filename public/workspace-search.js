export function* textMatches(text, query) {
  const literal = query.trim();
  if (!literal) return;
  const pattern = new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  for (const match of String(text || '').matchAll(pattern)) yield { from: match.index, to: match.index + match[0].length };
}
export const plainText = text => String(text || '').replace(/!\[[^\]\n]*\]\([^\n)]*\)/g, ' ').replace(/\[([^\]\n]+)\]\([^\n)]*\)/g, '$1').replace(/[#*`>|]/g, '').replace(/\s+/g, ' ').trim();

export function searchWorkspace(data, query, type = 'all', limit = 40) {
  const q = query.trim(), matches = [];
  if (!q) return { results: [], total: 0 };
  function add(kind, record, text, extra = {}) {
    if (type !== 'all' && type !== kind) return;
    const title = textMatches(record.title, q).next().value, body = plainText(text), bodyMatch = textMatches(body, q).next().value, index = bodyMatch?.from ?? -1;
    if (!title && index < 0) return;
    const start = Math.max(0, index - 30), end = Math.min(body.length, Math.max(index, 0) + Math.max(q.length, 1) + 70);
    matches.push({ kind, id: record.id, title: record.title, archived: Boolean(record.archived),
      snippet: `${start ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`,
      rank: title?.from === 0 && title.to === record.title.length ? 0 : title?.from === 0 ? 1 : title ? 2 : 3, ...extra });
  }
  for (const project of data.projects) {
    add('project', project, project.description);
    for (const task of project.tasks) add('task', task, '', { projectId: project.id, projectTitle: project.title, archived: Boolean(task.archived || project.archived) });
  }
  for (const note of data.notes) add('note', note, `${note.body} ${note.tags.join(' ')} ${note.category}`, { category: note.category });
  matches.sort((a, b) => a.rank - b.rank);
  return { results: matches.slice(0, limit), total: matches.length };
}

export function highlightText(text, query, escape) {
  let html = '', offset = 0;
  for (const { from, to } of textMatches(text, query)) {
    html += escape(text.slice(offset, from)) + '<mark>' + escape(text.slice(from, to)) + '</mark>';
    offset = to;
  }
  return html + escape(text.slice(offset));
}
