#!/usr/bin/env bash
# ==============================================================================
# Royal Rung (Court Piece) — Automated Oracle Cloud (OCI) VM Provisioning Script
# Tested on: Ubuntu 22.04 / 24.04 LTS (ARM64 Ampere A1 & AMD64 Micro)
# ==============================================================================
set -euo pipefail

REPO_URL="${1:-https://github.com/zeerakt/rung.git}"
APP_DIR="/opt/rung"
SERVICE_USER="${SUDO_USER:-ubuntu}"

echo "=== [1/5] Installing Node.js 20 LTS, Nginx & Certbot ==="
sudo apt-get update -y
sudo apt-get install -y curl git nginx certbot python3-certbot-nginx iptables-persistent

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "=== [2/5] Opening Oracle Cloud OS Firewall Ports (80, 443, 8080) ==="
# Oracle Cloud Ubuntu images include strict default iptables REJECT rules
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save

echo "=== [3/5] Cloning / Updating Repository in ${APP_DIR} ==="
if [ -d "${APP_DIR}/.git" ]; then
  cd "${APP_DIR}"
  sudo -u "${SERVICE_USER}" git pull origin main
else
  sudo mkdir -p "${APP_DIR}"
  sudo chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
  sudo -u "${SERVICE_USER}" git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

echo "=== [4/5] Running Verification Test Suite (Docs + Unit + Multiplayer + Sim) ==="
sudo -u "${SERVICE_USER}" npm test

echo "=== [5/5] Installing systemd Service & Nginx Reverse Proxy ==="
sudo cp "${APP_DIR}/deploy/oracle-vm/rung-multiplayer.service" /etc/systemd/system/rung-multiplayer.service
sudo systemctl daemon-reload
sudo systemctl enable --now rung-multiplayer.service

sudo cp "${APP_DIR}/deploy/oracle-vm/nginx-rung.conf" /etc/nginx/sites-available/rung
sudo ln -sf /etc/nginx/sites-available/rung /etc/nginx/sites-enabled/rung
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "✅ Oracle Cloud VM Multiplayer Server is LIVE!"
echo "   • Local Health Check: curl http://127.0.0.1:8080/health"
echo "   • Next Step: Run 'sudo certbot --nginx -d your-domain.com' to enable wss:// TLS for GitHub Pages!"
