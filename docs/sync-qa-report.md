# 多端同步验证记录 · 2026-10-18

## 本机验证

- `npm run check`：全部 JavaScript 语法检查通过。
- `npm run test:unit`：34/34 通过，覆盖账户隔离、密码与会话、CSRF、并发版本校验、数据库重启、三方合并、删除/编辑冲突及关联完整性。
- `npm run test:sync`：9/9 通过。使用独立 Edge 上下文与真实 HTTP/SQLite 服务，验证双端同步、离线重载与重连、冲突副本和导出、账号切换、跨窗口归属校验、异步响应及切换中断恢复。
- `npm test`：78/78 通过，覆盖桌面、平板和手机的原有记录、布局、搜索、备份和编辑交互。
- `docker compose --env-file .env.example config --quiet`：通过。
- Caddy 2.11.7 官方 Windows 二进制校验 SHA-512 后运行 `adapt --validate`：通过；确认 `8.147.235.91` 使用 Let's Encrypt ACME `shortlived`，而非本地自签证书。
- `scripts/deploy.sh` 经 Git Bash `bash -n` 检查通过。

## 交付与待完成事项

发布包：`release/shixu-vps-8.147.235.91.tar.gz`。仅包含应用代码、部署脚本和配置文档；不含本机数据库、真实 .env、密钥、开发依赖或测试产物。

本机 Docker 引擎未运行，因此未执行镜像构建；Docker Hub 镜像清单访问在当前网络超时。此处记录的是最初本机交付状态；实际服务器上线结果见下方 2026-10-19 补充。

## 2026-10-19 公网部署补充

已通过 SSH 部署到 Ubuntu 24.04 的 `8.147.235.91`。Docker Hub 不可达，因此采用 Node.js 24.22.0、Caddy 2.11.7 与 systemd；运行文件均校验官方摘要。应用与代理使用独立系统用户，服务已设开机启动和失败自动重启。

Let’s Encrypt IP 证书已签发，SAN 为 `8.147.235.91`。修复 NAT 后未发送 SNI 的客户端不能选择证书的问题：增加 `default_sni`。Windows curl、服务器 curl 和 Edge 均通过正常证书校验，没有忽略 TLS 错误。

`node scripts/verify-live.mjs`：真实公网两个独立 Edge 上下文完成注册、同号登录、初次工作区连接、项目修改上传、另一端接收、远端 API 内容核对，通过。此脚本不输出密码或邀请码。

服务重启前后测试工作区仍为 revision 2，内容 SHA-256 一致。随后仅删除本次生成的 QA 账号及其会话、工作区、历史记录，清理后公网健康接口仍返回 `{"ok":true}`。

实际运行配置和原生部署维护步骤已补入 `sync-deployment.md`。Docker 镜像构建仍未验证，不能把原生上线结果表述为 Docker 构建成功。

FinalShell 登录与系统 OpenSSH 不共享认证配置。已准备 `release/enable-system-ssh.txt`，仅包含本机现有公钥的幂等安装命令，需用户在已登录的服务器执行后提供用户名；没有读取 FinalShell 保存的密码或本机私钥。

截图：`docs/screenshots/sync-conflicts-desktop.png` 和 `sync-conflicts-mobile.png`。
