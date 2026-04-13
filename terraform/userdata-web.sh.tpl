#!/bin/bash
set -e
exec > /var/log/userdata-web.log 2>&1

apt-get update -y
apt-get install -y nginx git

# Clone repo
git clone ${github_repo} /opt/feedreader

# Copy frontend files
mkdir -p /var/www/html
cp -r /opt/feedreader/frontend/. /var/www/html/

# Write nginx config
cat > /etc/nginx/sites-available/feedreader <<NGINXCONF
server {
    listen 80 default_server;
    root /var/www/html;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://${app_alb_dns}/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/feedreader /etc/nginx/sites-enabled/feedreader
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "[web] Setup complete"