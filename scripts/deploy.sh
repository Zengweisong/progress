#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  printf '%s\n' '需要先安装 Docker Engine 和 Compose 插件。未修改服务器。' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  printf '%s\n' 'Docker 服务未启动或当前用户无权限。请先处理后重新运行。' >&2
  exit 1
fi
if [ ! -f .env ]; then
  umask 077
  invite_code=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'SITE_ADDRESS=8.147.235.91\nREGISTRATION_CODE=%s\nALLOW_REGISTRATION=true\n' "$invite_code" > .env
  printf '%s\n' '已创建 .env 和随机注册邀请码；可在本目录 .env 文件中查看。'
fi
docker compose config --quiet
docker compose pull caddy
docker compose up -d --build
docker compose ps
printf '\n%s\n' '请等待证书签发，并检查 docker compose logs --tail=80 app caddy'
printf '%s\n' '确认云安全组和服务器允许 TCP 80、443。然后访问 https://8.147.235.91'
printf '%s\n' '数据库保存在 shixu_data 卷。更新时重新运行本脚本；不要执行 docker compose down -v。'
