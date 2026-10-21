export const sectionNames = { projects: '我的项目', knowledge: '知识库', inbox: '收集箱' };
export const categoryField = section => section === 'projects' ? 'tag' : 'category';

export function categoryRecords(data, section) {
  return section === 'projects' ? data.projects : data.notes.filter(note => note.inbox === (section === 'inbox'));
}

export function categoryNames(data, section) {
  const names = [...new Set([
    ...(data.folders || []).filter(folder => folder.section === section && !folder.uncategorizedHidden).map(folder => folder.name),
    ...categoryRecords(data, section).map(record => record[categoryField(section)]),
  ].filter(Boolean))];
  const positions = new Map((data.folders || []).filter(folder => folder.section === section && !folder.uncategorizedHidden && folder.order !== undefined).map(folder => [folder.name, folder.order]));
  return names.map((name, index) => ({ name, index })).sort((a, b) => (positions.get(a.name) ?? a.index) - (positions.get(b.name) ?? b.index) || a.index - b.index).map(item => item.name);
}

export const uncategorizedHidden = (data, section) => (data.folders || []).some(folder => folder.section === section && folder.uncategorizedHidden);
export function navigationCategories(data, section) {
  const names = categoryNames(data, section);
  if (!uncategorizedHidden(data, section) && categoryRecords(data, section).some(record => !record[categoryField(section)])) names.push('');
  return names;
}

export function writeCategory(data, section, previousName, input, id, updatedAt) {
  const name = input.trim();
  if (!Object.hasOwn(sectionNames, section) || !name || name.length > 60 || ['未分类', '全部项目', '全部笔记', '全部想法'].includes(name)) throw new Error('请填写 1–60 字的分类名称，避开“未分类”和“全部”等系统名称。');
  if (name !== previousName && categoryNames(data, section).includes(name)) throw new Error('这个位置已有同名分类，请换一个名称。');
  let folder = data.folders.find(item => !item.uncategorizedHidden && item.section === section && item.name === previousName);
  if (!folder) {
    if (data.folders.length >= 300) throw new Error('分类数量已达上限，请先整理现有分类。');
    folder = { id, section, name, updatedAt };
    data.folders.push(folder);
  }
  for (const item of data.folders) if (!item.uncategorizedHidden && item.section === section && item.name === previousName) { item.name = name; item.updatedAt = updatedAt; }
  if (previousName !== null && previousName !== name) {
    for (const record of categoryRecords(data, section)) {
      if (record[categoryField(section)] === previousName) { record[categoryField(section)] = name; record.updatedAt = updatedAt; }
    }
  }
  return folder;
}

export function removeCategory(data, section, name, updatedAt) {
  if (name === '') {
    if (!Object.hasOwn(sectionNames, section)) throw new Error('分类位置不正确。');
    if (!uncategorizedHidden(data, section)) {
      if (data.folders.length >= 300) throw new Error('分类数量已达上限，请先整理现有分类。');
      data.folders.push({ id: `uncategorized-hidden-${section}`, section, name: '未分类', uncategorizedHidden: true, updatedAt });
    }
    return;
  }
  data.folders = data.folders.filter(folder => folder.uncategorizedHidden || folder.section !== section || folder.name !== name);
  for (const record of categoryRecords(data, section)) {
    if (record[categoryField(section)] === name) { record[categoryField(section)] = ''; record.updatedAt = updatedAt; }
  }
}
