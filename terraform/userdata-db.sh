#!/bin/bash
set -e
exec > /var/log/userdata-db.log 2>&1

apt-get update -y
apt-get install -y mysql-server

# Allow remote connections
sed -i 's/^bind-address\s*=.*/bind-address = 0.0.0.0/' \
    /etc/mysql/mysql.conf.d/mysqld.cnf

systemctl enable mysql
systemctl start mysql

# Wait until MySQL is up
for i in $(seq 1 15); do
  mysqladmin ping --silent && break || sleep 3
done

mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${db_name}\`;
CREATE USER IF NOT EXISTS '${db_user}'@'%' IDENTIFIED BY '${db_pass}';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${db_user}'@'%';
FLUSH PRIVILEGES;
SQL

systemctl restart mysql

echo "[db] MySQL ready — database: ${db_name}, user: ${db_user}"