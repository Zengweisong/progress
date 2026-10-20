# 拾序 · VPS 多端同步部署

项目已部署到 **https://8.147.235.91**。服务器使用 Ubuntu 24.04、Node.js 24.22.0、Caddy 2.11.7 和 systemd。由于服务器访问 Docker Hub 超时，实际部署使用原生进程；Docker Compose 配置仍保留为可选方案。服务器部署提供网页与同步服务；Windows 桌面客户端的构建与使用见 [Windows 桌面版](windows-app.md)。

## 当前线上实例（2026-10-19）

- 程序：`/opt/shixu/app`；校验过官方摘要的运行环境：`/opt/shixu/runtime`。
- 数据库与 WAL：`/var/lib/shixu/`，运行用户 `shixu`。
- 配置与邀请码：`/etc/shixu/app.env`，仅 root 可读（权限 600）。修改后执行 `systemctl restart shixu`。
- HTTPS 配置：`/etc/shixu/Caddyfile`；证书状态：`/var/lib/shixu-proxy/`，运行用户 `shixu-proxy`。
- 服务：`shixu.service` 与 `shixu-proxy.service`，均已启用开机启动和失败自动重启。
- Node 只监听 `127.0.0.1:4173`；公网通过 Caddy 的 80/443 访问。HTTP 自动跳转 HTTPS。
- Caddy 配置 `default_sni 8.147.235.91`，使未发送 SNI 的 IP 客户端也能取得正确证书。容器配置使用同样的保护。

已用正常 TLS 校验验证公网健康接口和两个独立 Edge 浏览器的注册、登录与同步；服务重启前后工作区版本和内容摘要一致。验证账号已精确清理。注册邀请码另存于本机 `release/server-access.txt`，不会进入发布包。

常用维护命令：

```bash
systemctl status shixu shixu-proxy
journalctl -u shixu -u shixu-proxy -n 80 --no-pager
curl --fail https://8.147.235.91/api/health
```

更新时先备份，再将程序更新到 `/opt/shixu/app`，保留 `/etc/shixu/` 与两个 `/var/lib/` 数据目录，然后执行 `systemctl restart shixu`。只更改 Caddy 配置时，先验证后 `systemctl reload shixu-proxy`。不要在同一服务器启动下文的 Docker 代理与当前代理争用端口。

原生部署备份命令如下；停止应用后归档完整数据库目录，避免只复制正在写入的 SQLite 主文件：

```bash
umask 077
mkdir -p /var/backups/shixu
systemctl stop shixu
tar -czf "/var/backups/shixu/shixu-$(date -u +%Y%m%dT%H%M%SZ).tgz" /var/lib/shixu /var/lib/shixu-proxy /etc/shixu /etc/systemd/system/shixu.service /etc/systemd/system/shixu-proxy.service
systemctl start shixu
```

将备份复制到服务器之外的受保护位置。恢复应在停服后进行，并检查文件所有者仍为相应服务用户；先保留当前实例，以便回退。运行环境下载、摘要校验和服务定义见 `scripts/deploy-native.sh`。

## 以下为可选 Docker 部署流程

当前配置直接使用 **8.147.235.91**，无需购买域名。Let’s Encrypt 已提供受信任的公网 IP 证书；Caddy 2.11.7 显式使用 ACME `shortlived` 配置申请，并自动续期。证书约有效 6 天，因此 Caddy 必须持续运行且验证端口保持可达。不要换成旧版 Caddy 或省略 `issuer acme`，否则可能获得设备不信任的本地证书。参考：[Let’s Encrypt 官方公告](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)、[Caddy TLS 配置](https://caddyserver.com/docs/caddyfile/directives/tls)。

如果使用 FinalShell，可将发布包上传到服务器的新目录（例如 `/opt/shixu`），解压后在该目录执行 `bash scripts/deploy.sh`。脚本检查 Docker，首次创建随机注册邀请码并启动应用；已有 `.env` 会保留，不覆盖服务器其他网站配置。如果 80/443 已被使用，需要先整合现有反向代理。

## 1. 准备服务器与访问地址

需要一台可运行 Docker Engine 与 Docker Compose 插件的 Linux VPS，以及固定公网 IP（也可以使用域名）。以下命令使用 Linux shell，在包含 `compose.yaml` 的项目目录执行。

- 使用公网 IP 时无需配置 DNS。当前示例已填写 8.147.235.91；如果使用域名，将 A 记录指向 VPS 公网 IPv4，若设置 AAAA，确认 IPv6 也可达。
- 在云安全组与服务器防火墙开放 TCP 80、443。Caddy 使用这些端口验证公网地址、申请证书并提供 HTTPS。
- 确保 80、443 没有被其他服务占用；现有反向代理需要自行整合配置。
- 上传完整项目，尤其是 `public/`、`server/`、`server.mjs`、`Dockerfile`、`compose.yaml`、`Caddyfile`、`package.json` 和 `.env.example`。

服务只通过 Caddy 对外暴露；应用容器的 4173 端口在 Compose 内部网络访问，不应额外开放到公网。

## 2. 配置并启动

```bash
cp .env.example .env
```

编辑 `.env`：

```dotenv
SITE_ADDRESS=8.147.235.91
REGISTRATION_CODE=这里替换为长且随机的邀请码
ALLOW_REGISTRATION=true
```

`SITE_ADDRESS` 填写公网 IP 或域名，不含 `https://`、端口或路径。邀请码只交给需要注册的人；不要使用示例值或将真实 `.env` 提交到仓库。Compose 会将 `PUBLIC_ORIGIN` 设置为 `https://${SITE_ADDRESS}`，用于来源校验和生产环境会话。

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=80 app caddy
```

等待 `app` 健康检查通过且 Caddy 成功提供证书，访问 https://8.147.235.91（或你配置的地址）。可检查：

```bash
curl --fail https://8.147.235.91/api/health
```

成功应返回 `{"ok":true}`。健康接口通过仅表示服务可响应，还需用浏览器注册、连接工作区并进行两台设备同步测试。

账号为 3–40 位文字、数字、点、横线或下划线，密码为 10–128 个字符。注册界面会要求邀请码。当前没有邮件验证或密码重置功能，请妥善保存账号密码。

需要的账号都注册完成后，将 `.env` 中 `ALLOW_REGISTRATION` 改为 `false`，保留 `REGISTRATION_CODE`，再执行：

```bash
docker compose up -d app
```

已有账号仍能登录；需要新增账号时可暂时重新开放注册。仅重启容器不会读取修改后的 Compose 环境变量，使用上述 `up -d` 更新配置。

## 3. 连接电脑与手机

每台设备都访问同一个 HTTPS 地址，登录同一账号。登录后选择“同步本机工作区”或“打开账号工作区”：前者将本机记录加入账号，后者先归档本机内容，再使用云端工作区。登录动作本身不会把游客示例数据上传到账号。第二台新设备通常选择“打开账号工作区”。

主工作区 `main` 与版面实验室 `lab` 是两个独立空间，需分别连接；四种实验室版面共用 `lab` 数据。项目、任务、笔记和自定义字段参与同步，视图偏好留在本机。

修改先保存到本机，随后上传；后台约每 15 秒检查远端修改，也可点击“立即同步”。正在输入、存在草稿或本机保存失败时会暂停应用远端修改。不同设备修改不同记录可自动合并；相同记录产生冲突时可查看双方内容，选择保留副本或某一版本。处理冲突前会在浏览器 IndexedDB 中保留恢复快照。

初次在线访问并完成 Service Worker 页面缓存后，可以断网重开同一地址、继续记录。首次未缓存或浏览器清理缓存后，离线打不开属于预期；浏览器不支持 Service Worker 时也不提供离线重开。离线不支持注册、登录验证或获取远端更新，恢复连接后会重试同步。

浏览器存储按协议、主机名和端口隔离。`http://127.0.0.1:4173` 的数据不会自动出现在 `https://notes.example.com`；先在旧地址导出普通工作区 JSON，再到新地址导入独立副本。更换域名后也需要重新登录及连接工作区。

登录会话使用 HttpOnly、SameSite=Lax Cookie，HTTPS 生产环境另有 Secure 标记；令牌不放入 localStorage。当前并非端到端加密，持有服务器数据库的人能够读取内容。退出只结束服务器会话，**不会清空这台设备的本机记录或恢复备份**；还有未同步修改或冲突时会阻止退出，包括另一个空间的待同步修改。

## 4. 备份服务器数据

账号、会话、主工作区、实验室和有限版本历史均保存在 `shixu_data` 命名卷中的 `/app/data`。SQLite 使用 WAL：数据库旁可能还有 `shixu.sqlite-wal` 和 `shixu.sqlite-shm`。不要仅复制正在写入的单个 `.sqlite` 文件。浏览器里的未上传草稿与本机恢复快照不在服务器备份中。

下例暂停应用，归档整个数据目录，再启动应用。Caddy 可以保持运行；暂停期间网页可能暂时无法连接同步服务。本地保存仍可使用。

```bash
backup_dir="$(pwd)/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
docker compose stop app
docker compose run --rm --no-deps --user root --entrypoint tar --volume "$backup_dir:/backup" app -czf /backup/shixu-data.tgz -C /app/data .
docker compose start app
docker compose ps
```

检查归档已生成且可读取，再将它复制到服务器之外的受保护位置。另行保存当前部署代码版本和 `.env`；备份含个人记录与有效会话数据，访问权限应受到保护。Caddy 的 `caddy_data`、`caddy_config` 卷保存证书和配置状态，服务器整体迁移时也应一并备份。

**不要使用 `docker compose down -v` 清理部署**，它会删除数据库与证书的命名卷。普通更新或停止不需要删除卷。

## 5. 从服务器备份恢复

先备份当前实例。建议将归档恢复到一个**新的空数据卷**，保留原卷便于回退，避免旧 WAL 文件混入恢复后的数据库。使用与备份对应的代码版本，确认 `.env` 的公网地址正确。

下面的 `backup_dir` 必须改为实际归档所在目录。恢复过程中暂停应用，创建新的命名卷，并生成只覆盖数据库卷的 Compose 配置：

```bash
backup_dir="/srv/shixu/backups/20261018T120000Z"
restore_volume="shixu-restored-$(date -u +%Y%m%dT%H%M%SZ)"
docker compose stop app
docker volume create "$restore_volume"
cat > compose.restore.yaml <<EOF
volumes:
  shixu_data:
    external: true
    name: $restore_volume
EOF
docker compose -f compose.yaml -f compose.restore.yaml run --rm --no-deps --user root --entrypoint tar --volume "$backup_dir:/backup:ro" app -xzf /backup/shixu-data.tgz -C /app/data
docker compose -f compose.yaml -f compose.restore.yaml up -d
docker compose -f compose.yaml -f compose.restore.yaml ps
```

归档包含文件所有者，使用同一 Docker 镜像中的 `node` 用户时可以继续读取。检查日志、健康接口、账号登录和两个空间的数据后再恢复正常使用。恢复前让其他设备暂时离线并各自导出备份；恢复的是旧版本，重连设备可能带来更新内容或冲突，需要比较后处理。

此后维护该恢复实例时，所有 Compose 命令都需同时使用 `-f compose.yaml -f compose.restore.yaml`。原来的数据库卷仍然保留；不要误用只包含原配置的启动命令切回旧数据。外部卷也需纳入后续备份计划。

## 6. 浏览器导出与恢复

“数据与备份 → 导出完整数据”生成普通工作区 JSON，可以用“导入为独立副本”重新加入主工作区，不覆盖现有内容。

“账号与多端同步 → 导出数据与恢复备份”生成 `shixu-sync-recovery-v1` 包，含 `current` 当前工作区、`baseline` 同步基线、`conflict` 冲突信息与 `archives` 历史快照。这份包不能直接当普通 JSON 导入；需要将要恢复的 `current` 或某个 `archives` 项的 `data` 对象另存为普通工作区 JSON，再导入为独立副本。当前实验室没有普通 JSON 导入界面，恢复实验室内容需要人工处理备份或通过服务器完整恢复；不要把实验室备份直接覆盖主工作区。

恢复快照保存在生成它的浏览器中，不会自动上传到其他设备。清理浏览器数据会连同这些快照一起删除，请先导出。

## 7. 更新、运行范围与验证

更新前备份数据库，上传新代码后执行：

```bash
docker compose up -d --build
docker compose ps
```

若使用恢复覆盖配置，给上述命令加上两份 `-f` 参数。数据库卷会保留。当前服务使用本地 SQLite 和进程内限流，按**单实例**部署；不支持多个应用副本共享同一数据库卷，也没有跨服务器复制或自动故障切换。

直接运行 Node 时，环境变量包括 `HOST`、`PORT`、`DATA_DIR`、`PUBLIC_ORIGIN`、`ALLOW_REGISTRATION`、`REGISTRATION_CODE`。生产模式 `NODE_ENV=production` 强制要求 HTTPS `PUBLIC_ORIGIN`，应放在支持 HTTPS 的反向代理后面；仓库提供的 Docker/Caddy 配置已包含这些设置。

开发环境可运行 `npm run check`、`npm run test:unit`、`npm run test:sync` 与 `npm test`。上线后还需用两个独立浏览器或设备验证：创建记录、另一端接收、离线编辑后重连、同一记录冲突处理，以及主工作区与实验室相互独立。不要将本地测试通过或提供了 Dockerfile 等同于 VPS 已成功上线。

