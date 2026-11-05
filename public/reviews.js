const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const dailyFields = [
  ['event', '发生了什么'],
  ['feeling', '当时的想法和感受'],
  ['insight', '重新理解这件事'],
  ['action', '当时的行动'],
  ['next', '下一步行动'],
  ['result', '已经发生的结果'],
  ['expected', '期待的变化'],
];
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function shiftDate(key, days) { const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + days); return dateKey(date); }
export function weekStart(key) { const date = new Date(`${key}T12:00:00`); return shiftDate(key, -((date.getDay() + 6) % 7)); }
export function reviewPeriod(mode, date) { return mode === 'weekly' ? weekStart(date) : mode === 'monthly' ? date.slice(0, 4) : date; }
export function validReview(record) {
  if (!record || typeof record.id !== 'string' || !record.id || record.id.length > 100 || !['daily', 'weekly', 'monthly'].includes(record.mode) || typeof record.date !== 'string' || typeof record.title !== 'string' || !record.title.trim() || record.title.length > 200 || typeof record.updatedAt !== 'string' || Number.isNaN(Date.parse(record.updatedAt))) return false;
  if (record.mode === 'monthly' ? !/^[1-9]\d{3}$/.test(record.date) : !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(record.date) || dateKey(new Date(`${record.date}T12:00:00`)) !== record.date) return false;
  const keys = record.mode === 'daily' ? dailyFields.map(([key]) => key) : record.mode === 'weekly' ? ['summary', 'heart', 'action', 'result', 'next', ...Array.from({ length: 7 }, (_, i) => `day${i}`)] : Array.from({ length: 12 }, (_, i) => ['heart', 'action', 'result', 'notes'].map(key => `${i + 1}-${key}`)).flat();
  return record.values && typeof record.values === 'object' && !Array.isArray(record.values) && Object.entries(record.values).every(([key, value]) => keys.includes(key) && typeof value === 'string' && value.length <= 20000);
}
export function renderReviews(data, state) {
  const { mode, date, selected } = state, period = reviewPeriod(mode, date);
  const entries = (data.reviews || []).filter(r => r.mode === mode && r.date === period);
  const record = entries.find(r => r.id === selected) || entries[0];
  const values = record?.values || {};
  const field = (key, title, extra = '') => `<label class="review-card ${extra}"><span class="review-card-title">${title}</span><textarea data-review-field="${key}" aria-label="${title}" maxlength="20000">${esc(values[key] || '')}</textarea></label>`;
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  const count = Object.values(values).filter(value => value.trim()).length;
  return `<section class="page reviews-page" data-review-id="${esc(record?.id || '')}">
    <div class="page-heading"><h1>复盘</h1><span class="review-save" role="status">${record ? '已保存到本机' : '填写后自动保存'}</span></div>
    <div class="review-toolbar"><div class="review-tabs" role="tablist" aria-label="复盘周期">${[['daily', '每日画布'], ['weekly', '周度复盘'], ['monthly', '月度总览']].map(([key, title]) => `<button role="tab" aria-selected="${mode === key}" data-review-mode="${key}">${title}</button>`).join('')}</div><div class="review-date-controls"><button class="button" data-review-step="-1" aria-label="上一个周期">←</button><label><input type="${mode === 'monthly' ? 'number' : 'date'}" id="review-date" aria-label="复盘日期" ${mode === 'monthly' ? 'min="1900" max="9998"' : 'min="1900-01-01" max="9998-12-31"'} value="${mode === 'monthly' ? date.slice(0, 4) : date}"></label><button class="button" data-review-step="1" aria-label="下一个周期">→</button><button class="button" data-review-today>今天</button></div></div>
    <div class="review-context"><div><strong>${mode === 'daily' ? date.replaceAll('-', ' / ') : mode === 'weekly' ? `${start.replaceAll('-', '/')} — ${days[6].replaceAll('-', '/')}` : `${date.slice(0, 4)} 年`}</strong></div><span class="review-completion">已填写 ${count} 项</span></div>
    ${entries.length > 1 ? `<label class="review-copy-picker">当前副本 <select id="review-copy">${entries.map(r => `<option value="${esc(r.id)}" ${r.id === record.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select></label>` : ''}
    ${mode === 'daily' ? `<div class="review-canvas" aria-label="每日复盘画布"><div class="review-canvas-inner"><div class="review-event">${field(...dailyFields[0], 'event-card')}</div><div class="review-fork"><span></span><span></span></div><div class="review-paths"><div class="review-path past"><div class="review-path-heading"><span>回看当时</span></div>${[1, 3, 5].map((i, n) => `${n ? '<div class="review-connector" aria-hidden="true">↓</div>' : ''}${field(...dailyFields[i])}`).join('')}</div><div class="review-path future"><div class="review-path-heading"><span>重塑意义</span></div>${[2, 4, 6].map((i, n) => `${n ? '<div class="review-connector" aria-hidden="true">↓</div>' : ''}${field(...dailyFields[i])}`).join('')}</div></div></div></div>` : mode === 'weekly' ? `<div class="review-week"><div class="review-week-summary">${field('summary', '一周回望')}${field('heart', '内心的变化')}${field('action', '行动与尝试')}${field('result', '收获与结果')}${field('next', '下周计划')}</div><div class="review-week-days">${days.map((day, i) => {
      const daily = (data.reviews || []).filter(r => r.mode === 'daily' && r.date === day);
      return `<div class="review-day"><div class="review-day-label"><strong>${day.slice(5).replace('-', '/')}</strong><span>周${'一二三四五六日'[i]}</span><button data-review-open-day="${day}">${daily.length ? `${daily.length} 篇画布` : '写日复盘'} ↗</button></div><div>${field(`day${i}`, `${day.slice(5)} 每日记录`)}${daily.length ? `<p class="review-daily-excerpt">${esc(daily.map(r => r.values.event).filter(Boolean).join('；').slice(0, 220))}</p>` : ''}</div></div>`;
    }).join('')}</div></div>` : `<div class="review-month-scroll"><table class="review-month-table"><thead><tr><th>月份</th>${['内心', '行动', '结果', '备注'].map(t => `<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: 12 }, (_, i) => `<tr><th scope="row">${String(i + 1).padStart(2, '0')}<small>月</small></th>${['heart', 'action', 'result', 'notes'].map((key, j) => `<td><textarea aria-label="${i + 1}月${['内心', '行动', '结果', '备注'][j]}" data-review-field="${i + 1}-${key}" maxlength="20000">${esc(values[`${i + 1}-${key}`] || '')}</textarea></td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
  </section>`;
}
