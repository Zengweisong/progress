#!/usr/bin/env bash
# Install the uploaded application on a dedicated Ubuntu host without Docker.
set -euo pipefail
test "$(id -u)" = 0 || { echo 'Run as root.' >&2; exit 1; }
test -f /opt/shixu/app/server.mjs || { echo 'Extract the release into /opt/shixu/app first.' >&2; exit 1; }
cd /opt/shixu/downloads
printf '%s\n' 'cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008  node.tar.xz' | sha256sum -c -
printf '%s\n' 'a7a433a1b133efc3c8d10eb0b99d52a24b5ef5c322dc77f5282182b1c0402139ab83f3a99f0c52409df77d20123fb0b523edad8a66d8f5e49136197bf61ef0e7  caddy.tar.gz' | sha512sum -c -
mkdir -p /opt/shixu/runtime /etc/shixu
tar -xJf node.tar.xz -C /opt/shixu/runtime
tar -xzf caddy.tar.gz -C /opt/shixu/runtime caddy
chmod 755 /opt/shixu/runtime/caddy
id shixu >/dev/null 2>&1 || useradd --system --home-dir /var/lib/shixu --shell /usr/sbin/nologin shixu
id shixu-proxy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/shixu-proxy --shell /usr/sbin/nologin shixu-proxy
install -d -m 750 -o shixu -g shixu /var/lib/shixu
install -d -m 750 -o shixu-proxy -g shixu-proxy /var/lib/shixu-proxy
if [ ! -f /etc/shixu/app.env ]; then
  umask 077
  invite_code=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  printf 'NODE_ENV=production\nHOST=127.0.0.1\nPORT=4173\nDATA_DIR=/var/lib/shixu\nPUBLIC_ORIGIN=https://8.147.235.91\nALLOW_REGISTRATION=true\nREGISTRATION_CODE=%s\n' "$invite_code" > /etc/shixu/app.env
fi
chmod 600 /etc/shixu/app.env
cat > /etc/shixu/Caddyfile <<'CADDY'
{
  default_sni 8.147.235.91
}

8.147.235.91 {
  tls {
    issuer acme https://acme-v02.api.letsencrypt.org/directory {
      profile shortlived
    }
  }
  encode zstd gzip
  reverse_proxy 127.0.0.1:4173
}
CADDY
chmod 644 /etc/shixu/Caddyfile
cat > /etc/systemd/system/shixu.service <<'UNIT'
[Unit]
Description=Shixu workspace and sync service
After=network.target

[Service]
Type=simple
User=shixu
Group=shixu
WorkingDirectory=/opt/shixu/app
EnvironmentFile=/etc/shixu/app.env
ExecStart=/opt/shixu/runtime/node-v24.22.0-linux-x64/bin/node /opt/shixu/app/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/shixu
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/systemd/system/shixu-proxy.service <<'UNIT'
[Unit]
Description=Shixu HTTPS proxy and automatic IP certificate renewal
After=network-online.target shixu.service
Wants=network-online.target

[Service]
Type=notify
User=shixu-proxy
Group=shixu-proxy
Environment=HOME=/var/lib/shixu-proxy
Environment=XDG_DATA_HOME=/var/lib/shixu-proxy/data
Environment=XDG_CONFIG_HOME=/var/lib/shixu-proxy/config
ExecStart=/opt/shixu/runtime/caddy run --config /etc/shixu/Caddyfile --adapter caddyfile
ExecReload=/opt/shixu/runtime/caddy reload --config /etc/shixu/Caddyfile --adapter caddyfile
Restart=on-failure
RestartSec=5
TimeoutStopSec=10
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/shixu-proxy
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
chmod 644 /etc/systemd/system/shixu.service /etc/systemd/system/shixu-proxy.service
/opt/shixu/runtime/caddy fmt --overwrite /etc/shixu/Caddyfile
runuser -u shixu-proxy -- env HOME=/var/lib/shixu-proxy XDG_DATA_HOME=/var/lib/shixu-proxy/data XDG_CONFIG_HOME=/var/lib/shixu-proxy/config /opt/shixu/runtime/caddy validate --config /etc/shixu/Caddyfile
systemd-analyze verify /etc/systemd/system/shixu.service /etc/systemd/system/shixu-proxy.service
systemctl daemon-reload
systemctl enable --now shixu.service shixu-proxy.service
systemctl is-active shixu.service shixu-proxy.service
