export const statuses = [
  { id: 'planned', label: '待开始', color: 'gray', icon: 'circle' },
  { id: 'active', label: '进行中', color: 'blue', icon: 'progress' },
  { id: 'review', label: '待回顾', color: 'amber', icon: 'review' },
  { id: 'done', label: '已完成', color: 'green', icon: 'checkCircle' },
];
export const priorities = { high: '高优先级', medium: '中优先级', low: '低优先级' };
export const categories = ['全部笔记', '产品与设计', '技术实践', '阅读与思考', '生活记录'];

const project = (id, title, description, status, priority, tag, icon, color, due, tasks, pinned = false) => ({
  id, title, description, status, priority, tag, icon, color, due, pinned,
  tasks: tasks.map((title, i) => ({ id: `${id}-t${i}`, title: title.replace(/^✓ /, ''), done: title.startsWith('✓ ') })),
  updatedAt: `2026-10-${18 - Number(id.slice(1)) % 5}T03:00:00.000Z`, custom: {},
});
const note = (id, title, summary, category, tags, projectIds, body, inbox = false) => ({ id, title, summary, category, tags, projectIds, body, inbox, updatedAt: '2026-10-18T02:00:00.000Z' });

export function seedData() {
  return {
    version: 1,
    projects: [
      project('p1', '个人知识库 2.0', '把散落的想法、项目笔记和阅读摘录，整理成自己的知识系统。', 'active', 'high', '个人成长', 'layers', 'blue', '2026-10-28', ['✓ 梳理知识分类与标签', '✓ 整理现有项目笔记', '✓ 确定项目与笔记关联方式', '完成检索与快速记录流程', '试用并优化整理习惯'], true),
      project('p2', '独立博客改版', '留一块属于自己的数字花园，分享设计、技术与日常观察。', 'active', 'medium', '创作', 'globe', 'purple', '2026-11-05', ['✓ 整理内容栏目', '✓ 完成首页结构', '设计文章阅读页', '迁移历史文章', '检查移动端排版'], true),
      project('p3', '产品设计进阶', '用一个真实项目练习从问题定义到交互细节的完整设计过程。', 'planned', 'medium', '学习', 'pen', 'peach', '2026-11-15', ['整理学习路线', '选择一个练习课题', '完成第一轮原型']),
      project('p4', '年度阅读计划', '少一些收藏，多一些阅读。记录那些真正改变了想法的句子。', 'active', 'low', '个人成长', 'book', 'green', '2026-12-31', ['✓ 阅读《认知觉醒》', '✓ 完成十月阅读笔记', '阅读《设计心理学》', '整理年度书单'], true),
      project('p5', '秋日旅行计划', '在天气转凉之前，去山里走走，拍一些照片。', 'planned', 'low', '生活', 'mountain', 'green', '2026-11-08', ['确定目的地与路线', '预订住宿', '整理轻装出行清单']),
      project('p6', '摄影作品集', '给喜欢的照片一个好好展示的地方。', 'review', 'medium', '创作', 'camera', 'purple', '2026-10-22', ['✓ 挑选 24 张作品', '✓ 按主题编排', '✓ 统一照片色调', '检查导出质量']),
      project('p7', '习惯记录工具', '完成了一个简单的习惯记录小工具，开始把它用起来。', 'done', 'low', '技术', 'code', 'blue', '2026-10-12', ['✓ 确定核心功能', '✓ 实现记录与统计', '✓ 完成第一周试用']),
      project('p8', '工作空间整理', '让桌面更清爽，也给专注多留一点空间。', 'planned', 'low', '生活', 'layout', 'peach', '', ['整理桌面物品', '归档旧文件', '调整常用工具布局']),
    ],
    notes: [
      note('n1', '让知识真正流动起来', '知识不只是收藏，更是与正在做的事情发生联系。', '产品与设计', ['知识管理', '方法'], ['p1'], '# 让知识真正流动起来\n\n过去的笔记常常是记完就忘。与其不断增加分类，不如从正在做的项目出发，把需要用到的知识连接起来。\n\n## 三个整理原则\n\n- 先记录，再整理，不让分类打断思考。\n- 一条笔记可以服务多个项目，不必复制多份。\n- 在项目复盘时，把可复用的方法留在知识库。\n\n> 真正有价值的知识，是能在需要时回到手边的知识。\n\n## 下一步\n\n用个人知识库项目试跑这套流程，观察哪些关联真的会被打开。'),
      note('n2', '一个安静的阅读界面', '减少阅读过程中的干扰，让内容成为界面的主角。', '产品与设计', ['排版', '阅读体验'], ['p2', 'p6'], '# 一个安静的阅读界面\n\n阅读页应该让人自然地读下去。\n\n## 排版观察\n\n- 正文行距保持舒展，段落间有明确停顿。\n- 文本宽度适中，不让视线在长行中迷路。\n- 导航和辅助信息退后一步，保留足够的留白。\n\n## 应用到博客\n\n先用一篇长文章测试阅读节奏，再决定字号和内容区宽度。'),
      note('n3', '离线优先的数据设计', '先在本地可靠保存，再把变化同步到其他设备。', '技术实践', ['离线优先', '数据'], ['p1'], '# 离线优先的数据设计\n\n编辑不应该被网络打断。保存到本地是第一步，同步是之后发生的事情。\n\n## 需要验证的场景\n\n- 断网时新增或修改笔记。\n- 同一台设备刷新或重启后继续使用。\n- 两台设备离线编辑同一条内容。\n- 附件上传中断后继续传输。\n\n## 冲突处理\n\n在无法安全合并时，先保留两个版本，再让用户决定如何整理。'),
      note('n4', '《认知觉醒》阅读摘记', '把注意力放回可执行的小行动，保持长期的练习。', '阅读与思考', ['阅读', '成长'], ['p4'], '# 《认知觉醒》阅读摘记\n\n这次阅读最想带走的，不是更多概念，而是每天都可以实践的一点改变。\n\n## 我的理解\n\n- 把模糊的目标变成能开始的一小步。\n- 为重要的事情留出稳定的时间。\n- 记录反馈，根据实际体验调整做法。\n\n## 本周尝试\n\n每天阅读后写三句话：读到了什么、联想到什么、准备尝试什么。'),
      note('n5', '练习：先问对问题', '在画界面之前，先弄清楚用户真正想完成的事。', '产品与设计', ['设计练习'], ['p3'], '# 练习：先问对问题\n\n一个设计练习的开始，可以是一段具体的经历。\n\n## 练习问题\n\n- 当时想完成什么？\n- 哪一步最让人犹豫？\n- 现在是怎样绕过去的？\n\n把回答整理为一个场景，再开始画流程。'),
      note('n6', '旅行时的轻装清单', '需要带上的不一定很多，留下空间给路上的发现。', '生活记录', ['旅行'], ['p5'], '# 旅行时的轻装清单\n\n## 随身\n\n- 证件、手机、充电宝。\n- 一件保暖外套。\n- 相机和一支常用镜头。\n\n## 出发前\n\n确认天气、交通和住宿地址，并把重要信息保存到本地。'),
      note('n7', '一个关于快速记录的想法', '想到的时候，应该可以先写下来，不必先决定放在哪里。', '产品与设计', ['灵感'], [], '# 一个关于快速记录的想法\n\n如果每次记录都要先选项目、分类和标签，很多想法可能就不会被记下来。\n\n收集箱可以承接这些还没整理的内容。等有空时，再把它们与项目连接起来。', true),
    ],
    fields: [],
    folders: [],
    preferences: { view: 'board', sort: 'updated', group: 'status' },
  };
}

export function validateData(value) {
  const fail = () => { throw new Error('备份格式不正确，请选择由拾序导出的 JSON 文件。'); };
  if (!value || value.version !== 1 || !Array.isArray(value.projects) || !Array.isArray(value.notes) || !Array.isArray(value.fields)) fail();
  if (value.projects.length > 3000 || value.notes.length > 10000 || value.fields.length > 30) fail();
  const str = (v, max = 20000) => typeof v === 'string' && v.length <= max;
  const ids = new Set();
  for (const p of value.projects) {
    if (!p || !str(p.id, 100) || ids.has(p.id) || !str(p.title, 200) || !p.title.trim() || !str(p.description) || !statuses.some(s => s.id === p.status) || !Object.hasOwn(priorities, p.priority) || !str(p.tag, 60) || !str(p.due, 10) || !Array.isArray(p.tasks) || p.tasks.length > 1000 || typeof p.pinned !== 'boolean' || !p.custom || typeof p.custom !== 'object' || Array.isArray(p.custom)) fail();
    if (p.due && !/^\d{4}-\d{2}-\d{2}$/.test(p.due)) fail();
    ids.add(p.id);
    if (p.modules !== undefined && (!Array.isArray(p.modules) || p.modules.length > 100)) fail();
    const moduleIds = new Set();
    for (const module of p.modules || []) {
      if (!module || !str(module.id, 100) || !module.id || moduleIds.has(module.id) || !str(module.name, 60) || !module.name.trim()) fail();
      moduleIds.add(module.id);
    }
    for (const t of p.tasks) {
      if (!t || !str(t.id, 100) || !str(t.title, 500) || typeof t.done !== 'boolean') fail();
      if (t.status !== undefined && (!['todo', 'active', 'done'].includes(t.status) || t.done !== (t.status === 'done'))) fail();
      if (t.moduleId !== undefined && (!str(t.moduleId, 100) || (t.moduleId && !moduleIds.has(t.moduleId)))) fail();
    }
    if (new Set(p.tasks.map(t => t.id)).size !== p.tasks.length) fail();
    if (Object.values(p.custom).some(v => !['string', 'number', 'boolean'].includes(typeof v) && v !== null)) fail();
    if (!str(p.updatedAt, 50) || Number.isNaN(Date.parse(p.updatedAt))) fail();
  }
  const noteIds = new Set();
  for (const n of value.notes) {
    if (!n || !str(n.id, 100) || noteIds.has(n.id) || !str(n.title, 200) || !n.title.trim() || !str(n.body, 200000) || !str(n.summary) || !str(n.category, 100) || !Array.isArray(n.tags) || !n.tags.every(t => str(t, 60)) || !Array.isArray(n.projectIds) || !n.projectIds.every(id => ids.has(id)) || typeof n.inbox !== 'boolean' || !str(n.updatedAt, 50) || Number.isNaN(Date.parse(n.updatedAt))) fail();
    noteIds.add(n.id);
  }
  const fieldIds = new Set();
  for (const f of value.fields) {
    if (!f || !str(f.id, 100) || fieldIds.has(f.id) || !str(f.name, 40) || !f.name.trim() || !['text', 'number', 'date', 'checkbox'].includes(f.type)) fail();
    fieldIds.add(f.id);
  }
  if (value.folders === undefined) value.folders = [];
  if (!Array.isArray(value.folders) || value.folders.length > 300) fail();
  const folderIds = new Set();
  for (const folder of value.folders) {
    if (!folder || !str(folder.id, 100) || !folder.id || folderIds.has(folder.id) || !['projects', 'knowledge', 'inbox'].includes(folder.section) || !str(folder.name, 60) || !folder.name.trim() || !str(folder.updatedAt, 50) || Number.isNaN(Date.parse(folder.updatedAt))) fail();
    folderIds.add(folder.id);
  }
  const prefs = value.preferences;
  value.preferences = { view: prefs?.view === 'table' ? 'table' : 'board', sort: ['updated', 'title', 'due'].includes(prefs?.sort) ? prefs.sort : 'updated', group: prefs?.group === 'priority' ? 'priority' : 'status' };
  return value;
}
