export const sectionNames = { projects: '我的项目', knowledge: '知识库', inbox: '收集箱' };
export const categoryField = section => section === 'projects' ? 'tag' : 'category';

export function categoryRecords(data, section) {
  return section === 'projects' ? data.projects : data.notes.filter(note => note.inbox === (section === 'inbox'));
}

export function categoryNames(data, section) {
  return [...new Set([
    ...(data.folders || []).filter(folder => folder.section === section).map(folder => folder.name),
    ...categoryRecords(data, section).map(record => record[categoryField(section)]),
  ].filter(Boolean))];
}

export function writeCategory(data, section, previousName, input, id, updatedAt) {
  const name = input.trim();
  if (!Object.hasOwn(sectionNames, section) || !name || name.length > 60 || ['未分类', '全部项目', '全部笔记', '全部想法'].includes(name)) throw new Error('请填写 1–60 字的分类名称，避开“未分类”和“全部”等系统名称。');
  if (name !== previousName && categoryNames(data, section).includes(name)) throw new Error('这个位置已有同名分类，请换一个名称。');
  let folder = data.folders.find(item => item.section === section && item.name === previousName);
  if (!folder) {
    if (data.folders.length >= 300) throw new Error('分类数量已达上限，请先整理现有分类。');
    folder = { id, section, name, updatedAt };
    data.folders.push(folder);
  }
  for (const item of data.folders) if (item.section === section && item.name === previousName) { item.name = name; item.updatedAt = updatedAt; }
  if (previousName !== null && previousName !== name) {
    for (const record of categoryRecords(data, section)) {
      if (record[categoryField(section)] === previousName) { record[categoryField(section)] = name; record.updatedAt = updatedAt; }
    }
  }
  return folder;
}

export function removeCategory(data, section, name, updatedAt) {
  data.folders = data.folders.filter(folder => folder.section !== section || folder.name !== name);
  for (const record of categoryRecords(data, section)) {
    if (record[categoryField(section)] === name) { record[categoryField(section)] = ''; record.updatedAt = updatedAt; }
  }
}
