# 主工作区项目路线图验收（2026-10-20）

已将项目路线图接入主工作区并更新到 `https://8.147.235.91`。Windows 桌面版加载同一服务，重新打开可获取新版页面。

## 行为

- 主工作区顶部可选择项目路线图、看板、表格，默认路线图；布局偏好单独保存在设备本机，不改写旧工作区数据格式。
- 使用原有项目、任务和笔记，沿用 `main` 同步空间；实验室仍独立。
- 任务站点可直接勾选；记录栏可批量添加任务、保存关联笔记、在没有项目时保存到收集箱。
- 草稿在当前页面会话内按项目保留，切换版面、项目、筛选和详情时可继续编辑；未保存时暂缓同步。刷新前应保存草稿。
- 实验室路线图新增“应用到我的工作区”入口，切换布局而不导入实验室记录。
- 新建项目后清除路线筛选并选择新项目；保存失败时保留草稿并回滚该次录入，避免重复添加。

## 本机验证

分批通过 102 项界面测试（桌面、平板、手机）、10 项账号与同步浏览器测试、34 项单元测试，以及 `npm run check`。验证覆盖现有看板/表格流程、预览数据隔离、布局记忆、任务更新、笔记关联、草稿、中文组合输入、安全文本渲染、存储失败、新建项目和多设备同步。

命令：

```powershell
npm run check
npm run test:unit
npx playwright test tests/workspace-route.spec.js tests/prototype.spec.js
npx playwright test tests/layouts.spec.js tests/designs.spec.js tests/workspace-route.spec.js
npx playwright test tests/designs.spec.js tests/workspace-route.spec.js --grep 'preview interactions|failed storage|creating a project'
npm run test:sync
npx playwright test -c playwright.sync.config.js --grep 'route tasks and linked notes'
```

初次兼容测试发现旧设计预览测试假定首页为看板，已改为明确选择看板后验证。新同步测试按记录 ID 比较内容，避免把合并后的笔记数组顺序差异当成内容丢失；修正后相应用例通过。

## 线上发布与验证

仅更新 `public/app.js`、`public/index.html`、`public/layouts.js`、`public/sw.js`，新增 `public/workspace-route.css`。资源先上传到隔离目录并验证 SHA-256，再使用 Linux `renameat2(RENAME_EXCHANGE)` 原子交换前端目录。Node 服务 PID 在发布前后均为 `425040`，没有重启服务。

回退前端位于 `/opt/shixu/app/public-route-20261020-01`，完整发布前端备份位于 `/var/backups/shixu/public-before-route-20261020-01.tgz`。回退时可原子交换当前 `public` 与该回退目录；不要修改数据库或配置目录。

运行 `node scripts/verify-route-layout.mjs` 验证通过：

- 正常 TLS 下健康接口成功，五个发布资源的 SHA-256 与本地一致。
- 隔离的桌面及手机浏览器可显示路线图、切换布局并在刷新后记住选择。
- 任务和笔记录入保存在临时浏览器本机空间，实验室应用入口保持两份数据独立。
- 离线重新加载后路线图与新增样式均可用，无页面运行时错误。
- 未注册生产测试账号，未向生产工作区上传测试记录。

线上截图：`docs/screenshots/workspace-route-live-desktop.png`、`docs/screenshots/workspace-route-live-mobile.png`。
