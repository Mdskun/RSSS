# FeedReader

A self-hosted RSS reader with per-user accounts, article thumbnails, full-content storage,
and OPML import/export — deployed on AWS using a 3-tier architecture.

## Live Architecture

```
Internet
   │
   ▼
[Internet Gateway]
   │
   ▼
[Web ALB]  ←── public, port 80
  ├── Web EC2-A  (nginx · AZ1 · public subnet)
  └── Web EC2-B  (nginx · AZ2 · public subnet)
        │  proxy /api/* →
        ▼
[App ALB]  ←── internal, port 80
  ├── App EC2-A  (Node.js :3000 · AZ1 · private subnet)
  └── App EC2-B  (Node.js :3000 · AZ2 · private subnet)
        │
        ▼
[RDS MySQL 8.0]  ←── private subnet, port 3306
```

CloudWatch alarms → SNS → Email when app EC2 CPU > 70 % (warning) or > 90 % (critical).

---

## Project Structure

```
feedreader/
├── frontend/
│   ├── index.html       # Single-page app
│   ├── style.css        # All styles
│   └── app.js           # Vanilla JS — auth, feeds, articles, OPML
│
├── backend/
│   ├── server.js        # Express API — auth, feeds, articles, OPML
│   ├── db.js            # MySQL pool + schema init
│   └── package.json
│
├── terraform/
│   ├── main.tf          # VPC, subnets, ALBs, EC2s, RDS
│   ├── monitoring.tf    # CloudWatch alarms + SNS + Dashboard
│   ├── variables.tf
│   ├── outputs.tf
│   ├── userdata-web.sh.tpl   # nginx setup + frontend deploy
│   └── userdata-app.sh.tpl   # Node.js + PM2 setup
│
├── .github/
│   └── workflows/
│       └── ci.yml       # Syntax check on push
│
└── README.md
```

---

## Prerequisites

| Tool        | Version  | Install |
|-------------|----------|---------|
| Terraform   | ≥ 1.6    | https://developer.hashicorp.com/terraform/install |
| AWS CLI     | ≥ 2.x    | https://aws.amazon.com/cli/ |
| Node.js     | ≥ 18.x   | https://nodejs.org/ |
| AWS account | —        | IAM user with EC2, RDS, VPC, CloudWatch, SNS permissions |

---

## Deploy to AWS

### 1. Clone and push to your own GitHub

```bash
git clone https://github.com/YOU/feedreader
cd feedreader
# make any changes, then:
git remote set-url origin https://github.com/YOUR_USERNAME/feedreader
git push -u origin main
```

### 2. Configure AWS credentials

```bash
aws configure
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region:        us-east-1
```

### 3. Create an EC2 key pair (if you don't have one)

```bash
aws ec2 create-key-pair \
  --key-name feedreader-key \
  --query 'KeyMaterial' \
  --output text > feedreader-key.pem
chmod 400 feedreader-key.pem
```

### 4. Deploy

```bash
cd terraform
terraform init
terraform apply \
  -var="github_repo=https://github.com/YOUR_USERNAME/feedreader" \
  -var="key_name=feedreader-key" \
  -var="alert_email=you@example.com"
```

Terraform will print:

```
website_url   = "http://feedreader-web-alb-xxxx.us-east-1.elb.amazonaws.com"
rds_endpoint  = "feedreader-mysql.xxxx.us-east-1.rds.amazonaws.com"
```

> **First deploy takes ~12 minutes** — RDS provisioning is the slow part (5–8 min).
> After `apply` completes, wait another 2–3 minutes for EC2 user-data scripts to finish.

### 5. Confirm SNS email

AWS sends a confirmation email to your `alert_email`. **Click "Confirm subscription"**
or you will not receive any alerts.

### 6. Open the site

Visit the `website_url` from Terraform output. Create an account and add your first feed.

---

## Tear down

```bash
cd terraform
terraform destroy
```

This removes everything — VPC, EC2s, RDS, ALBs, SNS, CloudWatch alarms.
RDS has `skip_final_snapshot = true` so no snapshot is saved on destroy.
Change this to `false` before running in production.

---

## Local Development

No AWS needed for local dev.

```bash
# 1. Start MySQL (Docker is easiest)
docker run -d \
  --name feedreader-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=rssdb \
  -e MYSQL_USER=rssuser \
  -e MYSQL_PASSWORD=rsspassword \
  -p 3306:3306 \
  mysql:8.0

# 2. Start the backend
cd backend
npm install
node server.js
# → [server] :3000

# 3. Serve the frontend (new terminal)
cd frontend
python3 -m http.server 8080
# → visit http://localhost:8080
```

The frontend proxies `/api/*` to `localhost:3000` automatically (same origin in dev via the API='' setting).

---

## API Reference

All routes except `/api/health`, `/api/auth/register`, `/api/auth/login`
require `Authorization: Bearer <token>`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET`  | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account `{ email, password }` |
| `POST` | `/api/auth/login` | Sign in → returns JWT |
| `GET`  | `/api/feeds` | List your feeds |
| `POST` | `/api/feeds` | Add feed `{ url, name? }` |
| `DELETE` | `/api/feeds/:id` | Remove feed + its articles |
| `POST` | `/api/feeds/:id/refresh` | Re-fetch latest articles |
| `GET`  | `/api/feeds/export` | Download OPML backup |
| `POST` | `/api/feeds/import` | Import OPML `{ opml: "<xml>" }` |
| `GET`  | `/api/articles?feed_id=&limit=` | List articles |
| `GET`  | `/api/articles/:id` | Single article with full content |

---

## CloudWatch Monitoring

Two alarm levels per app EC2:

| Alarm | Threshold | Window | Action |
|-------|-----------|--------|--------|
| Warning | CPU ≥ 70% | 10 min sustained | Email via SNS |
| Critical | CPU ≥ 90% | 5 min sustained | Email via SNS |

A recovery email is sent when CPU drops back below the warning threshold.

View the dashboard in AWS Console → CloudWatch → Dashboards → `feedreader-dashboard`.

---

## OPML Backup / Restore

**Export** — click "Export OPML" in the sidebar. Downloads `feedreader.opml`.
Compatible with any RSS reader (Feedly, NewsBlur, Miniflux, etc.).

**Import** — click "Import OPML" and select any `.opml` or `.xml` file.
The server fetches each feed and saves articles. A progress modal shows status.

---

## Production Checklist

- [ ] Change `db_pass` and `JWT_SECRET` from defaults
- [ ] Set `deletion_protection = true` and `skip_final_snapshot = false` in RDS
- [ ] Set `multi_az = true` on RDS for high availability
- [ ] Restrict SSH `0.0.0.0/0` to your own IP in web EC2 security group
- [ ] Put an ACM certificate on the Web ALB and enable HTTPS
- [ ] Set `cpu_alarm_threshold` to match your expected baseline

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML / CSS / JS (no framework) |
| Backend | Node.js + Express |
| Database | MySQL 8.0 on AWS RDS |
| Web server | nginx (reverse proxy + static files) |
| Process manager | PM2 |
| Infrastructure | Terraform |
| Monitoring | AWS CloudWatch + SNS |
| Auth | JWT (30-day tokens) + bcrypt |