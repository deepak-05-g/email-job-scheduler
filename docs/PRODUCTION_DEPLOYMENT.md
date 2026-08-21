# Production Deployment & Launch Readiness Guide

This document outlines the complete procedure for deploying the **Full-Stack Email Job Scheduler** to production environments.

---

## 1. System Architecture

```text
                    ┌─────────────────────────┐
                    │  React Frontend (SPA)   │
                    │   https://app.domain    │
                    └────────────┬────────────┘
                                 │ HTTPS (with credentials: include)
                                 ▼
                    ┌─────────────────────────┐
                    │    Express API (v1)     │
                    │   https://api.domain    │
                    └──────┬────────────┬─────┘
                           │            │
                    ┌──────▼─────┐ ┌────▼──────┐
                    │ PostgreSQL │ │   Redis   │
                    │  (Prisma)  │ │ (BullMQ)  │
                    └────────────┘ └─────┬─────┘
                                         │ Delayed BullMQ Jobs
                                         ▼
                                 ┌───────────────┐
                                 │ Email Worker  │
                                 │  (apps/worker)│
                                 └───────┬───────┘
                                         │ SMTP Dispatch
                                         ▼
                                  Production SMTP
                            (SendGrid / SES / Postmark)
```

---

## 2. Infrastructure Requirements

| Service               | Recommended Provider                               | Notes                                        |
| :-------------------- | :------------------------------------------------- | :------------------------------------------- |
| **PostgreSQL** (v14+) | Supabase, Neon, AWS RDS, Railway Postgres          | Set `DATABASE_URL` with connection pooling   |
| **Redis** (v7+)       | Upstash, Redis Cloud, AWS ElastiCache              | Set `REDIS_URL` (supports `rediss://` TLS)   |
| **Express API**       | Render Web Service, Railway, Fly.io, AWS ECS       | Node.js 20+, exposes port `PORT` (or 3001)   |
| **Email Worker**      | Render Background Worker, Railway, Fly.io, AWS ECS | Node.js 20+, long-running background worker  |
| **React Web SPA**     | Vercel, Netlify, Cloudflare Pages, Nginx Container | Static SPA with client-side routing fallback |
| **SMTP Delivery**     | Amazon SES, SendGrid, Postmark, Resend             | Transactional email provider                 |

---

## 3. Production Environment Variables Reference

| Variable                     | Required | Description                                        | Example / Recommended Value                                |
| :--------------------------- | :------: | :------------------------------------------------- | :--------------------------------------------------------- |
| `NODE_ENV`                   |   Yes    | Runtime environment                                | `production`                                               |
| `PORT` / `API_PORT`          |   Yes    | HTTP port for Express API                          | `3001` or injected by cloud host                           |
| `API_PUBLIC_URL`             |   Yes    | Public HTTPS URL of the API                        | `https://api.yourdomain.com`                               |
| `WEB_PUBLIC_URL`             |   Yes    | Public HTTPS URL of the Frontend                   | `https://app.yourdomain.com`                               |
| `CORS_ORIGINS`               |   Yes    | Allowed frontend origins (comma-separated)         | `https://app.yourdomain.com`                               |
| `DATABASE_URL`               |   Yes    | PostgreSQL connection string                       | `postgresql://user:pass@host:5432/db?schema=public`        |
| `REDIS_URL`                  |   Yes    | Redis connection string (supports TLS `rediss://`) | `redis://default:pass@redis-host:6379`                     |
| `GOOGLE_CLIENT_ID`           |   Yes    | Google Cloud OAuth Client ID                       | `xxx.apps.googleusercontent.com`                           |
| `GOOGLE_CLIENT_SECRET`       |   Yes    | Google Cloud OAuth Client Secret                   | `GOCSPX-xxxx`                                              |
| `GOOGLE_CALLBACK_URL`        |   Yes    | Exact Google OAuth redirect callback               | `https://api.yourdomain.com/api/v1/auth/google/callback`   |
| `SESSION_SECRET`             |   Yes    | Secret for HMAC session hashing (32+ chars)        | `openssl rand -base64 32`                                  |
| `SESSION_COOKIE_NAME`        |   Yes    | Session cookie identifier                          | `email_scheduler_session`                                  |
| `SESSION_TTL_SECONDS`        |    No    | Session duration in seconds                        | `86400` (24 hours)                                         |
| `SMTP_HOST`                  |   Yes*   | Production SMTP host (*if using real SMTP)         | `smtp.sendgrid.net` / `email-smtp.us-east-1.amazonaws.com` |
| `SMTP_PORT`                  |   Yes*   | Production SMTP port                               | `587` (TLS) or `465` (SSL)                                 |
| `SMTP_USER`                  |   Yes*   | Production SMTP username                           | `apikey`                                                   |
| `SMTP_PASS`                  |   Yes*   | Production SMTP password or API token              | `SG.xxxx`                                                  |
| `SMTP_SECURE`                |    No    | True for port 465, false for port 587 (STARTTLS)   | `false`                                                    |
| `DEFAULT_FROM_EMAIL`         |   Yes    | Verified sender email address                      | `notifications@yourdomain.com`                             |
| `DEFAULT_FROM_NAME`          |    No    | Sender name display                                | `Email Scheduler`                                          |
| `WORKER_CONCURRENCY`         |    No    | Concurrent email jobs per worker process           | `5`                                                        |
| `MIN_SEND_DELAY_MS`          |    No    | Minimum spacing between emails per sender          | `2000` (2 seconds)                                         |
| `MAX_EMAILS_PER_HOUR`        |    No    | Default rate limit per sender per hour             | `100`                                                      |
| `WORKER_STALE_PROCESSING_MS` |    No    | Stale email lease recovery timeout                 | `300000` (5 minutes)                                       |

---

## 4. Step-by-Step Launch Checklist

### Step 1: Provision Managed Database & Queue

1. Create a managed PostgreSQL database.
2. Create a managed Redis database.
3. Save `DATABASE_URL` and `REDIS_URL`.

### Step 2: Configure Google Cloud OAuth 2.0

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create an OAuth 2.0 Web Application client.
3. Add **Authorized JavaScript origins**:
   - `https://app.yourdomain.com`
   - `https://api.yourdomain.com`
4. Add **Authorized redirect URIs**:
   - `https://api.yourdomain.com/api/v1/auth/google/callback`
5. Save `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Step 3: Run Database Migrations

Deploy Prisma migrations to the production database:

```bash
pnpm db:migrate:deploy
```

### Step 4: Deploy API Service (`apps/api`)

- Build command: `pnpm install --frozen-lockfile && pnpm --filter @email-scheduler/db run build && pnpm --filter @email-scheduler/api run build`
- Start command: `node apps/api/dist/server.js`
- Set all production environment variables listed above.

### Step 5: Deploy Worker Service (`apps/worker`)

- Build command: `pnpm install --frozen-lockfile && pnpm --filter @email-scheduler/db run build && pnpm --filter @email-scheduler/worker run build`
- Start command: `node apps/worker/dist/worker.js`
- Set database, Redis, and SMTP environment variables.

### Step 6: Deploy Frontend SPA (`apps/web`)

- Build command: `pnpm install --frozen-lockfile && pnpm --filter @email-scheduler/shared run build && pnpm --filter @email-scheduler/web run build`
- Output directory: `apps/web/dist`
- Set environment variable: `VITE_API_PUBLIC_URL=https://api.yourdomain.com`

### Step 7: Post-Deployment Smoke Test

1. Access `https://api.yourdomain.com/health` $\rightarrow$ Expect `{"status":"ok"}`.
2. Access `https://api.yourdomain.com/ready` $\rightarrow$ Expect `{"status":"ready","database":"ok","redis":"ok"}`.
3. Navigate to `https://app.yourdomain.com` and click "Continue with Google".
4. Create a test campaign with 2 recipients.
5. Verify emails transition to `SENT` and campaign reaches `COMPLETED`.
