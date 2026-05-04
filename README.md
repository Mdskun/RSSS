# 📡 FeedReader

> A self-hosted, multi-user RSS feed reader — deployed on AWS with a production-grade
> 3-tier architecture using Terraform. Built as a portfolio project to demonstrate
> cloud infrastructure, full-stack development, and DevOps practices.

---

## 🌐 Live Demo

After deployment, Terraform prints:
```
website_url = "http://feedreader-web-alb-xxxx.ap-south-1.elb.amazonaws.com"
```
Open that URL and you're live.

---

## 📸 What It Does

FeedReader lets you subscribe to any RSS or Atom news feed (BBC, Hacker News,
Reuters, etc.) and read all your articles in one clean place.

- **Add any RSS feed** by pasting its URL
- **Articles are saved** to your database — you can read them even without revisiting
  the original site
- **Thumbnails** are extracted automatically from each article
- **Full article view** — click any headline to read the full content inside the app
- **Per-user accounts** — each person's feeds and articles are completely separate
- **OPML import/export** — back up your subscriptions and move between RSS readers
- **CloudWatch alerts** — get an email if your server CPU spikes

---

## 🏗️ Architecture Overview

```
                         ┌─────────────────────────────────────────┐
                         │              AWS VPC (10.0.0.0/16)      │
                         │                                         │
  ┌──────────┐           │  ┌──────────────────────────────────┐   │
  │ Internet │─────────▶│  │         WEB TIER (Public)        │   │
  │ Gateway  │           │  │                                  │   │
  └──────────┘           │  │  ┌─────────┐    ┌─────────┐      │   │
                         │  │  │Web EC2-A│    │Web EC2-B│      │   │
                         │  │  │ nginx   │    │ nginx   │      │   │
                         │  │  │  AZ-1   │    │  AZ-2   │      │   │
                         │  │  └────┬────┘    └────┬────┘      │   │
                         │  │       └──────┬────────┘          │   │
                         │  │          Web ALB                 │   │
                         │  │       (public, port 80)          │   │
                         │  └──────────────┬───────────────────┘   │
                         │                 │ /api/* proxy          │
                         │  ┌──────────────▼───────────────────┐   │
                         │  │        APP TIER (Private)        │   │
                         │  │                                  │   │
                         │  │  ┌─────────┐    ┌─────────┐      │   │
                         │  │  │App EC2-A│    │App EC2-B│      │   │
                         │  │  │Node.js  │    │Node.js  │      │   │
                         │  │  │:3000 AZ1│    │:3000 AZ2│      │   │
                         │  │  └────┬────┘    └────┬────┘      │   │
                         │  │       └──────┬────────┘          │   │
                         │  │          App ALB                 │   │
                         │  │       (internal, port 80)        │   │
                         │  └──────────────┬───────────────────┘   │
                         │                 │ port 3306             │
                         │  ┌──────────────▼───────────────────┐   │
                         │  │        DATABASE TIER (Private)   │   │
                         │  │                                  │   │
                         │  │       ┌───────────────┐          │   │
                         │  │       │  AWS RDS MySQL│          │   │
                         │  │       │    8.0        │          │   │
                         │  │       │  (managed)    │          │   │
                         │  │       └───────────────┘          │   │
                         │  └──────────────────────────────────┘   │
                         └─────────────────────────────────────────┘
                                           │
                                  CloudWatch + SNS
                                  (CPU alerts → Email)
```

### Why 3 Tiers?

| Tier | What lives here | Why separated |
|------|----------------|---------------|
| **Web** | nginx, static HTML/CSS/JS | Public-facing. Only accepts port 80 from internet. Proxies API calls inward. |
| **App** | Node.js Express API | Private. Only accepts traffic from the Web tier. Handles business logic, RSS parsing, auth. |
| **DB** | AWS RDS MySQL | Private. Only accepts port 3306 from App tier. Data never exposed to internet. |

This separation means even if someone compromises the web server, they cannot
directly reach the database. Each tier has its own security group that only
allows traffic from the tier above it.

---

## 🗂️ Project Structure

```
feedreader/
│
├── frontend/                    # Runs on Web EC2 (served by nginx)
│   ├── index.html               # The entire single-page app — one HTML file
│   ├── style.css                # All styling — sidebar, cards, article view, auth
│   └── app.js                   # All JS — routing, auth, feed/article management, OPML
│
├── backend/                     # Runs on App EC2 (Node.js process managed by PM2)
│   ├── server.js                # Express API — all routes, RSS parsing, OPML, JWT auth
│   ├── db.js                    # MySQL connection pool + auto table creation on boot
│   └── package.json             # Dependencies: express, mysql2, rss-parser, jwt, bcrypt
│
├── terraform/                   # One-command AWS infrastructure
│   ├── main.tf                  # VPC, 6 subnets, IGW, NAT, ALBs, EC2s, RDS, security groups
│   ├── monitoring.tf            # CloudWatch alarms (2 per app EC2) + SNS + Dashboard
│   ├── variables.tf             # All input variables with defaults
│   ├── outputs.tf               # Prints website URL, RDS endpoint after deploy
│   ├── userdata-web.sh.tpl      # Runs on Web EC2 boot: installs nginx, clones repo, configures proxy
│   └── userdata-app.sh.tpl      # Runs on App EC2 boot: installs Node.js, PM2, starts server
│
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions: syntax check, terraform validate on every push
│
└── README.md                    # This file
```

---

## 🔄 How It All Works — Request Flow

Here is exactly what happens when you open the site and read an article:

```
1. Browser hits the Web ALB (public DNS)
        ↓
2. Web ALB picks one of the two Web EC2s (round-robin)
        ↓
3. nginx on Web EC2 serves index.html + style.css + app.js
        ↓
4. Browser runs app.js — user logs in
        ↓
5. app.js sends POST /api/auth/login to same origin
        ↓
6. nginx sees /api/* → proxies to App ALB (internal DNS)
        ↓
7. App ALB picks one of the two App EC2s
        ↓
8. Node.js on App EC2 checks credentials against RDS MySQL
        ↓
9. Returns JWT token → stored in localStorage
        ↓
10. All future requests carry Authorization: Bearer <token>
        ↓
11. User clicks "Add Feed" → Node.js fetches the RSS URL,
    parses it, extracts articles + thumbnails, saves to RDS
        ↓
12. User reads article → served from RDS (no re-fetch needed)
```

Everything after step 5 never touches the public internet — it's all
internal VPC traffic between private subnets.

---

## 🔐 Security Design

| What | How |
|------|-----|
| **Passwords** | Hashed with bcrypt (cost factor 10) — never stored in plain text |
| **Sessions** | JWT tokens, 30-day expiry, signed with a secret key |
| **DB access** | RDS is in a private subnet — zero public internet access |
| **App access** | App EC2s only accept traffic from the App ALB security group |
| **Web access** | Web EC2s only accept port 80 from the Web ALB security group |
| **Data isolation** | Every DB query filters by `user_id` — users never see each other's feeds |
| **XSS protection** | All article content run through a sanitizer that strips scripts/iframes |

---

## 📦 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Vanilla HTML + CSS + JS | No build step, no framework overhead, fast to load |
| Backend | Node.js + Express | Lightweight, great RSS parsing ecosystem |
| Database | MySQL 8.0 on AWS RDS | Managed — no patching, automated backups, multi-AZ ready |
| Web server | nginx | Reverse proxy + static file serving in one |
| Process manager | PM2 | Keeps Node.js alive, restarts on crash, starts on reboot |
| Infrastructure | Terraform | Entire AWS setup in code — reproducible, version controlled |
| Monitoring | CloudWatch + SNS | CPU alarms, response time dashboard, email notifications |
| Auth | JWT + bcrypt | Stateless, no session storage needed |
| CI | GitHub Actions | Validates code and Terraform on every push |

---

## ⚙️ How the Backend Works

### RSS Parsing (`server.js`)

When you add a feed URL, the backend:
1. Fetches the URL using `rss-parser`
2. Extracts each article's title, link, summary, author, publish date
3. Extracts thumbnails from `media:thumbnail`, `media:content`,
   enclosure tags, or the first `<img>` found in the article HTML
4. Saves everything to MySQL with `INSERT IGNORE` (safe to re-run)

### Authentication Flow

```
Register:  email + password → bcrypt hash → stored in users table → JWT returned
Login:     email + password → bcrypt.compare → JWT returned
Request:   JWT in Authorization header → verified → user.id extracted → query filtered
```

### Database Schema

```sql
users
  id, email, password_hash, created_at

feeds
  id, user_id, name, url, created_at
  UNIQUE(user_id, url)           ← one user can't add the same feed twice

articles
  id, feed_id, title, link, thumbnail, summary, content, author, pub_date, fetched_at
  UNIQUE(feed_id, link)          ← same article never stored twice
```

Tables are created automatically on first boot — no migration scripts needed.

---

## 🚨 Monitoring & Alerts

Two CloudWatch alarms per App EC2 (4 alarms total):

| Alarm | Trigger | Window | Email |
|-------|---------|--------|-------|
| **Warning** | CPU ≥ 70% | 10 minutes sustained | Yes + recovery |
| **Critical** | CPU ≥ 90% | 5 minutes | Yes |

The CloudWatch Dashboard (auto-created) shows:
- App EC2 CPU (both instances) with warning/critical threshold lines
- Web EC2 CPU (both instances)
- ALB request count per minute
- App ALB target response time (latency)
- Alarm status panel

> After deploy, check your inbox and **click the AWS confirmation link**
> or alerts will not be delivered.

---

## 🛠️ Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Terraform | ≥ 1.6 | https://developer.hashicorp.com/terraform/install |
| AWS CLI | ≥ 2.x | https://aws.amazon.com/cli/ |
| Node.js | ≥ 18.x | https://nodejs.org |
| Docker | any | https://docker.com (local dev only) |
| AWS account | — | IAM user needs EC2, RDS, VPC, CloudWatch, SNS permissions |

---

## 🚀 Deploy to AWS — Step by Step

### 1. Fork and clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/feedreader
cd feedreader
```

### 2. Configure AWS credentials

```bash
aws configure
# Enter your Access Key ID, Secret Access Key, region (e.g. ap-south-1)
```

### 3. Create an EC2 key pair

```bash
aws ec2 create-key-pair \
  --key-name feedreader-key \
  --query 'KeyMaterial' \
  --output text > feedreader-key.pem

chmod 400 feedreader-key.pem
```

### 4. Run Terraform

```bash
cd terraform
terraform init
terraform apply \
  -var="github_repo=https://github.com/YOUR_USERNAME/feedreader" \
  -var="key_name=feedreader-key" \
  -var="alert_email=you@example.com"
```

Type `yes` when prompted. Takes about 12 minutes (RDS is the slow part).

### 5. Wait for EC2 user-data to finish

After Terraform completes, the EC2s are still running their setup scripts
(installing Node, cloning your repo, starting nginx). Wait 3–4 more minutes
then visit the `website_url` from the output.

### 6. Confirm your SNS email subscription

Check your inbox for an email from AWS SNS → click **Confirm subscription**.

---

## 💻 Local Development

No AWS account needed to run locally.

### Start MySQL

```bash
docker run -d \
  --name feedreader-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=rssdb \
  -e MYSQL_USER=rssuser \
  -e MYSQL_PASSWORD=rsspassword \
  -p 3306:3306 \
  mysql:8.0
```

### Start the backend (Terminal 1)

```bash
cd backend
npm install
node server.js
# → [db] Tables ready
# → [server] :3000
```

### Start the frontend (Terminal 2)

```bash
cd frontend
python3 -m http.server 8080
```

Visit **http://localhost:8080**

### Auto-detect environment

The top of `app.js` contains:

```js
const API = window.location.port === '8080' || window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';
```

This means no code changes are needed between local and AWS — it detects
automatically which environment it's running in.

---

## 📡 OPML — Backup & Restore Your Feeds

OPML is an open standard format for sharing RSS subscription lists.
Every major RSS reader (Feedly, NewsBlur, Inoreader, Miniflux) supports it.

**Export** — click "Export OPML" in the sidebar bottom-left.
Downloads `feedreader.opml` — a standard XML file listing all your feed URLs.

**Import** — click "Import OPML" and select any `.opml` or `.xml` file.
The backend reads every feed URL, fetches it, and saves all articles.
A progress modal shows while this runs.

---

## 🔌 API Reference

All routes except health and auth require `Authorization: Bearer <token>` header.

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| `GET` | `/api/health` | — | Returns `{"ok":true}` |
| `POST` | `/api/auth/register` | `{email, password}` | Create account, returns JWT |
| `POST` | `/api/auth/login` | `{email, password}` | Sign in, returns JWT |
| `GET` | `/api/feeds` | — | List your feeds |
| `POST` | `/api/feeds` | `{url, name?}` | Add a new feed, fetches immediately |
| `DELETE` | `/api/feeds/:id` | — | Remove feed and all its articles |
| `POST` | `/api/feeds/:id/refresh` | — | Re-fetch latest articles for a feed |
| `GET` | `/api/feeds/export` | — | Download OPML file |
| `POST` | `/api/feeds/import` | `{opml: "<xml>"}` | Import feeds from OPML XML string |
| `GET` | `/api/articles` | `?feed_id=&limit=` | List articles (newest first) |
| `GET` | `/api/articles/:id` | — | Single article with full content |

---

## 🔧 Terraform Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-1` | AWS region to deploy into |
| `project` | `feedreader` | Prefix for all resource names |
| `github_repo` | required | Your public GitHub repo URL |
| `key_name` | required | EC2 key pair name for SSH |
| `instance_type` | `t3.micro` | EC2 size for web + app tiers |
| `db_instance_class` | `db.t3.micro` | RDS instance size |
| `db_user` | `rssuser` | MySQL username |
| `db_pass` | `RssP@ss2024!` | MySQL password — **change this** |
| `db_name` | `rssdb` | MySQL database name |
| `alert_email` | required | Email for CloudWatch CPU alerts |
| `cpu_alarm_threshold` | `70` | CPU % that triggers warning alarm |

---

## 🏭 Production Checklist

Before using this for real traffic, do these:

- [ ] Change `db_pass` to something strong and unique
- [ ] Change `JWT_SECRET` in `userdata-app.sh.tpl` from the default
- [ ] Set `deletion_protection = true` on the RDS resource
- [ ] Set `skip_final_snapshot = false` on the RDS resource
- [ ] Set `multi_az = true` on RDS for high availability
- [ ] Restrict SSH ingress on web EC2 security group from `0.0.0.0/0` to your IP
- [ ] Put an ACM SSL certificate on the Web ALB and enable HTTPS (port 443)
- [ ] Set up a custom domain and Route 53 hosted zone
- [ ] Review `cpu_alarm_threshold` — `70%` is conservative for `t3.micro`

---

## 💸 AWS Cost Estimate

Running this in `us-east-1` with `t3.micro` instances:

| Resource | Monthly cost (approx) |
|----------|----------------------|
| 4x EC2 t3.micro | ~$30 |
| RDS db.t3.micro | ~$15 |
| 2x ALB | ~$18 |
| NAT Gateway | ~$32 |
| Data transfer | ~$2 |
| CloudWatch | Free tier |
| **Total** | **~$97/month** |

> The NAT Gateway is the biggest surprise cost. It's needed so private
> App EC2s can reach the internet to clone your repo and install packages
> on boot. You can remove it after initial setup if you want to save ~$32/month
> (SSH into the instances via bastion to update them instead).

---

## 🗑️ Tear Down

To delete everything and stop all AWS charges:

```bash
cd terraform
terraform destroy
```

This removes every resource Terraform created — VPC, subnets, EC2s, RDS,
ALBs, NAT gateway, CloudWatch alarms, SNS topic. Nothing is left running.

---

## 🤝 GitHub Actions CI

On every push to `main` or pull request, GitHub automatically runs:

1. **Backend syntax check** — `node --check server.js db.js` (catches syntax errors without running)
2. **Terraform validate** — checks all `.tf` files are syntactically valid
3. **Frontend file check** — confirms `index.html`, `style.css`, `app.js` all exist

No secrets or AWS credentials needed for these checks.

---

## 📚 What I Learned / What This Demonstrates

This project was built to show real-world cloud deployment skills:

- **Terraform** — writing infrastructure as code from scratch, not using templates
- **3-tier architecture** — understanding why each tier is separated and how traffic flows
- **AWS networking** — VPCs, subnets, route tables, internet gateways, NAT gateways
- **Load balancing** — internal vs external ALBs, target groups, health checks
- **Security groups** — least-privilege rules between tiers
- **Managed databases** — RDS vs self-managed, subnet groups, private access
- **Monitoring** — CloudWatch metrics, alarms, dashboards, SNS notifications
- **User data scripts** — automating server setup on EC2 boot
- **Full-stack development** — REST API, JWT auth, database schema design
- **RSS/Atom parsing** — handling real-world feed inconsistencies

---

## 📝 License

MIT — use this however you like.
