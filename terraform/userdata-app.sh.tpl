#!/bin/bash
set -e
exec > /var/log/userdata-app.log 2>&1

apt-get update -y
apt-get install -y git curl

# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# PM2
npm install -g pm2

# Clone repo
git clone ${github_repo} /opt/feedreader

cd /opt/feedreader/backend
npm install --production

# Environment
cat > /opt/feedreader/backend/.env <<ENVFILE
DB_HOST=${db_host}
DB_USER=${db_user}
DB_PASS=${db_pass}
DB_NAME=${db_name}
PORT=3000
ENVFILE

# Load .env and start
export DB_HOST="${db_host}"
export DB_USER="${db_user}"
export DB_PASS="${db_pass}"
export DB_NAME="${db_name}"
export PORT=3000

pm2 start /opt/feedreader/backend/server.js --name feedreader
pm2 startup systemd -u root --hp /root
pm2 save

echo "[app] Setup complete"