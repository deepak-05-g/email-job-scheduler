# Email Job Scheduler

A monorepo foundation for a ReachInbox-style Full-stack Email Job Scheduler.

## Project Purpose

This repository houses the core architecture for a multi-tenant Email Job Scheduler application. It provides an Express HTTP API backend, background job worker, web interface frontend, PostgreSQL + Prisma database, Redis + BullMQ queue infrastructure, and Google OAuth 2.0 authentication.

## Monorepo Structure

```text
/
├── apps/
│   ├── api/        # TypeScript Express HTTP API service (Google OAuth, Sessions, REST)
│   ├── worker/     # TypeScript background worker service (BullMQ queue consumer)
│   └── web/        # React + Vite + TypeScript + Tailwind CSS web interface
├── packages/
│   ├── shared/     # Shared TypeScript types, DTOs, and error interfaces
│   ├── config/     # Centralized Zod environment configuration validation
│   ├── db/         # PostgreSQL + Prisma client & migrations
│   └── queue/      # Redis connection & BullMQ queue infrastructure
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── .gitignore
├── .env.example
├── .prettierrc
├── eslint.config.js
└── README.md
```

## Google OAuth 2.0 Setup Guide

To enable real Google OAuth 2.0 Authorization Code authentication:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a Google Cloud project.
3. Navigate to **APIs & Services** > **OAuth consent screen**:
   - User Type: **External**
   - Fill in app information and support email.
   - Add scopes: `openid`, `profile`, `email`.
4. Navigate to **APIs & Services** > **Credentials**:
   - Click **Create Credentials** > **OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Email Job Scheduler`.
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: `http://localhost:3001/api/v1/auth/google/callback`
5. Copy your **Client ID** and **Client Secret**.
6. Set credentials in your local `.env` file:
   ```env
   GOOGLE_CLIENT_ID="your-actual-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-actual-client-secret"
   GOOGLE_CALLBACK_URL="http://localhost:3001/api/v1/auth/google/callback"
   SESSION_SECRET="a-very-long-and-secure-random-secret-string-min-32-chars"
   ```

> [!WARNING]
> Never commit real Google Client Secrets or Session Secrets to Git repositories.

---

## Installation & Setup

1. Install dependencies across all workspace packages:

   ```bash
   pnpm install
   ```

2. Start PostgreSQL and Redis infrastructure:

   ```bash
   docker compose up -d
   ```

3. Run Prisma database migrations:
   ```bash
   pnpm --filter @email-scheduler/db run db:migrate
   ```

---

## Development Commands

Run all services in parallel:

```bash
pnpm dev
```

### Build & Code Quality Commands

- **Build all packages and applications:**
  ```bash
  pnpm build
  ```
- **Typecheck across all packages:**
  ```bash
  pnpm typecheck
  ```
- **Lint code:**
  ```bash
  pnpm lint
  ```
- **Run automated test suite:**
  ```bash
  pnpm test
  ```
- **Format code with Prettier:**
  ```bash
  pnpm format
  ```

## API Documentation (Step 5 — Campaign & Email Scheduling API)

All campaign and email endpoints require authenticated session cookies (`email_scheduler_session`) issued by Google OAuth authentication.

### 1. Create Campaign & Schedule Delayed Emails

- **Endpoint**: `POST /api/v1/campaigns`
- **Auth**: Required (Session Cookie)
- **Scheduling Model**: Deterministic BullMQ delayed jobs (`scheduledAt = startAt + index * delayBetweenEmailsMs`).
- **Deduplication**: Recipient emails are trimmed, lowercased, and deduplicated before database insertion.

#### Example Request:

```bash
curl -X POST http://localhost:3001/api/v1/campaigns \
  -H "Content-Type: application/json" \
  -b "email_scheduler_session=<SESSION_TOKEN>" \
  -d '{
    "subject": "Product Launch Announcement",
    "body": "<p>Hello! Welcome to our new product launch.</p>",
    "startAt": "2026-08-25T10:00:00.000Z",
    "delayBetweenEmailsMs": 2000,
    "hourlyLimit": 200,
    "recipients": [
      "lead1@example.com",
      "lead2@example.com",
      "LEAD1@example.com"
    ]
  }'
```

#### Example 201 Created Response:

```json
{
  "campaign": {
    "id": "cm7l982...",
    "subject": "Product Launch Announcement",
    "body": "<p>Hello! Welcome to our new product launch.</p>",
    "startAt": "2026-08-25T10:00:00.000Z",
    "delayBetweenEmailsMs": 2000,
    "hourlyLimit": 200,
    "totalCount": 2,
    "scheduledCount": 2,
    "sentCount": 0,
    "failedCount": 0,
    "status": "SCHEDULED",
    "createdAt": "2026-08-21T10:00:00.000Z"
  },
  "scheduling": {
    "enqueuedCount": 2,
    "failedEnqueueCount": 0,
    "allEnqueued": true
  }
}
```

---

### 2. List Campaigns

- **Endpoint**: `GET /api/v1/campaigns`
- **Query Parameters**: `page` (default 1), `limit` (default 25, max 100)
- **Auth**: Required
- **Returns**: Paginated list of campaigns owned by the authenticated user, sorted newest first.

```bash
curl http://localhost:3001/api/v1/campaigns?page=1&limit=10 \
  -b "email_scheduler_session=<SESSION_TOKEN>"
```

---

### 3. Get Campaign Details

- **Endpoint**: `GET /api/v1/campaigns/:campaignId`
- **Auth**: Required
- **Returns**: Full campaign details, sender info, and progress counts. Enforces ownership (returns 404 if not found or not owned by user).

```bash
curl http://localhost:3001/api/v1/campaigns/<CAMPAIGN_ID> \
  -b "email_scheduler_session=<SESSION_TOKEN>"
```

---

### 4. List Scheduled Emails

- **Endpoint**: `GET /api/v1/emails/scheduled`
- **Query Parameters**: `page` (default 1), `limit` (default 25, max 100)
- **Auth**: Required
- **Returns**: User's emails with statuses `SCHEDULED`, `PROCESSING`, or `RETRY_PENDING`, sorted chronologically by `scheduledAt` ascending.

```bash
curl http://localhost:3001/api/v1/emails/scheduled?page=1&limit=25 \
  -b "email_scheduler_session=<SESSION_TOKEN>"
```

---

### 5. List Sent & Failed Emails

- **Endpoint**: `GET /api/v1/emails/sent`
- **Query Parameters**: `page` (default 1), `limit` (default 25, max 100)
- **Auth**: Required
- **Returns**: User's emails with statuses `SENT` or `FAILED`, sorted newest first.

```bash
curl http://localhost:3001/api/v1/emails/sent?page=1&limit=25 \
  -b "email_scheduler_session=<SESSION_TOKEN>"
```

---

## BullMQ Delayed Job Architecture

- **Scheduler Engine**: Pure BullMQ delayed jobs (`max(0, scheduledAt - Date.now())`). No cron, node-cron, setInterval, or background polling loops.
- **Queue**: `email-send`
- **Payload**: Minimal `{ emailId: string }`
- **Deterministic Job ID**: `email_<emailId>` (prevents duplicate jobs on retry/re-enqueue)
- **Transactional Integrity**: Database records are committed before BullMQ jobs are enqueued to prevent phantom job execution on rollbacks.

---

## Worker & SMTP Pipeline (Step 6)

```text
BullMQ Job (emailId)
         │
         ▼
Load Email from PostgreSQL
         │
         ├── [Already SENT] ───────────► Complete (Idempotent Skip)
         ├── [Terminal FAILED] ────────► Skip
         │
         ▼
Atomic DB Claim (SCHEDULED/RETRY_PENDING ──► PROCESSING)
         │
         ▼
Distributed Rate Limiter (Redis)
         │
         ├── [Hourly Limit Exceeded] ──► Delay Job to Next Hour Window
         ├── [Min Send Delay Active] ──► Postpone/Delay Job
         │
         ▼
Ethereal SMTP Dispatch (Nodemailer)
         │
         ├── [Success] ──► Update Email status=SENT, set sentAt, clear lease, record campaign progress
         └── [Failure] ──► If attempts < 3: status=RETRY_PENDING, throw for BullMQ exponential backoff
                           If attempts >= 3: status=FAILED, record campaign failure
```

### 1. Ethereal SMTP Mail Service

- **Provider**: Ethereal Email SMTP (`smtp.ethereal.email:587`).
- **Sender Address**: Uses the sender profile's configured `fromEmail` without exposing secrets.
- **Development Previews**: Logs the safe Ethereal preview URL (`nodemailer.getTestMessageUrl(info)`) for visual verification of sent messages.

### 2. Idempotency & Atomic State Claims

- **Concurrency Protection**: Uses atomic conditional updates (`UPDATE ... WHERE status IN ('SCHEDULED', 'RETRY_PENDING')`) so that exactly one worker acquires the processing lease.
- **Duplicate Prevention**: If an email is already marked `SENT` (e.g. after a worker crash post-send), subsequent processing attempts immediately terminate without resending.
- **Known Limitation**: Because standard SMTP does not provide distributed two-phase commit / exactly-once delivery across remote mail transfer agents, atomic database leases and deterministic BullMQ job IDs provide the strongest practical at-most-once/idempotent delivery guarantee.

### 3. Stale Processing Recovery

- If an email remains in `PROCESSING` status longer than `WORKER_STALE_PROCESSING_MS` (default 5 minutes / 300,000ms), any worker encountering the job can safely claim and recover the lease.
- Zero polling or cron schedulers: recovery occurs on-demand when jobs are processed.

### 4. Distributed Redis Rate Limiting

- **Per-Sender Minimum Delay**: Coordinated across all worker instances via atomic Redis timestamps (`email-rate:last-send:<senderId>`). Workers never exceed the campaign's `delayBetweenEmailsMs`.
- **Per-Sender Hourly Rate Limit**: Atomic Redis hourly counters (`email-rate:hourly:<senderId>:<hourWindow>`) limit sends per hour.
- **Zero Email Loss**: When an hourly limit is exceeded, the email is not dropped or marked failed; it is rescheduled via BullMQ delayed jobs to the start of the next hour window.

### 5. Multi-Worker Concurrency & Resilience

- **Configurable Concurrency**: Worker concurrency is configurable via `WORKER_CONCURRENCY` (default 5).
- **Restart Resilience**: Delayed jobs persist across API, Worker, and Redis restarts via Redis AOF persistence and BullMQ delayed job hashes.

---

## Frontend Dashboard & Email Monitoring (Step 7)

A full-featured React 19 + Vite + Tailwind CSS dashboard (`apps/web`) that integrates with the backend API to create and monitor email scheduling jobs.

### 1. Routes & Application Structure

- `/login` — Google OAuth 2.0 sign-in page with error messaging.
- `/dashboard` — SaaS overview with live metrics cards (Total Campaigns, Scheduled/Queued, Sent, Failed) and recent campaigns table.
- `/campaigns/new` — Campaign creation wizard with recipient normalization, duplicate detection, spacing delay, and hourly limit configuration.
- `/campaigns` — Paginated list of all campaigns with status badges, progress bars, and start times.
- `/campaigns/:campaignId` — Detailed campaign inspection with live delivery progress percentages, sender info, body preview, and polling status refresh.
- `/emails/scheduled` — Real-time queue view for emails in `SCHEDULED`, `PROCESSING`, or `RETRY_PENDING` status.
- `/emails/sent` — Audit log of delivered (`SENT`) and `FAILED` emails with delivery timestamps and error causes.

### 2. State & Security Model

- **Zero Frontend Secrets**: No tokens or passwords stored in `localStorage` or `sessionStorage`.
- **Session Protection**: All requests use `credentials: 'include'` to pass HttpOnly HMAC-signed session cookies.
- **Protected Routing**: Unauthenticated requests are immediately routed to `/login`, and sign-out invalidates the session via `POST /api/v1/auth/logout`.

---

## Production Hardening, Observability & Error Handling (Step 8)

### 1. Centralized Error Handling & Sanitization

- **Express Error Middleware**: Standardized error envelopes `{ error: { message: string, code: string, details?: unknown } }`.
- **Database & Input Mapping**:
  - Zod validation failures $\rightarrow$ HTTP 400 with client-safe field messages.
  - Prisma unique constraint violations (`P2002`) $\rightarrow$ HTTP 409 `RESOURCE_CONFLICT`.
  - Record not found (`P2025`) $\rightarrow$ HTTP 404 `NOT_FOUND`.
  - Application Errors $\rightarrow$ Typed `AppError` status/code.
- **Zero Information Leakage**: Stack traces, raw SQL queries, file paths, and database connection strings are never returned in HTTP responses.

### 2. Distributed Correlation Request ID & Structured Logging

- **`X-Request-Id` Middleware**: Automatically generates or sanitizes a correlation UUID on every request, returned in response headers and propagated to structured logs.
- **Structured JSON Logger**: Production outputs structured JSON logs with `service`, `requestId`, `timestamp`, `level`, `userId`, `campaignId`, `emailId`.
- **Secret Redaction**: Automatically redacts sensitive fields (`password`, `token`, `secret`, `authorization`, `cookie`, `key`, `code`).

### 3. Redis-Backed API Rate Limiting

- **Authentication & OAuth**: 30 requests/minute per IP (`ratelimit:auth:*`).
- **Campaign Creation**: 20 requests/minute per user/IP (`ratelimit:campaign-create:*`).
- **General API**: 300 requests/minute per IP (`ratelimit:api-general:*`) to allow smooth dashboard polling without false positives.
- **HTTP 429 & Headers**: Returns `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After`.

### 4. Infrastructure Health & Readiness Endpoints

- `GET /health` $\rightarrow$ Process liveness status (`{ status: "ok" }`).
- `GET /ready` $\rightarrow$ Dependency readiness checking PostgreSQL (`SELECT 1`) and Redis (`PING`). Returns HTTP 200 `{ status: "ready", database: "ok", redis: "ok" }` or HTTP 503 if dependencies are down.

### 5. Graceful Shutdown & Resource Cleanup

- Both `apps/api` and `apps/worker` listen for `SIGTERM` and `SIGINT`.
- Closes HTTP server, BullMQ workers, Redis connections (`redis.quit()`), and Prisma database connections (`prisma.$disconnect()`) with a 10-second timeout fallback.

---

## Production Deployment (Step 9)

### 1. Production Architecture Overview

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
                                         │ Delayed Jobs
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

### 2. Required Production Services

1. **Managed PostgreSQL** (v14+): AWS RDS, Supabase, Neon, Railway Postgres, or Render PostgreSQL.
2. **Managed Redis** (v7+): Upstash, Redis Cloud, AWS ElastiCache, Railway Redis, or Render Redis (with TLS support via `rediss://` or `redis://`).
3. **Web Service — API (`apps/api`)**: Node.js 20+ runtime exposing HTTP port (`PORT` / `3001`).
4. **Background Worker (`apps/worker`)**: Headless Node.js 20+ background worker with no public HTTP ports.
5. **Static Frontend (`apps/web`)**: Deployed to Vercel, Netlify, Cloudflare Pages, AWS S3/CloudFront, or Docker Nginx container.
6. **Transactional SMTP Provider**: Amazon SES, SendGrid, Postmark, Mailgun, or Resend.

### 3. Production Environment Variables Reference

| Variable               | Required | Description                                        | Example / Recommended Value                                |
| :--------------------- | :------: | :------------------------------------------------- | :--------------------------------------------------------- |
| `NODE_ENV`             |   Yes    | Runtime environment                                | `production`                                               |
| `PORT` / `API_PORT`    |   Yes    | HTTP port for Express API                          | `3001` or injected by cloud host                           |
| `API_PUBLIC_URL`       |   Yes    | Public HTTPS URL of the API                        | `https://api.yourdomain.com`                               |
| `WEB_PUBLIC_URL`       |   Yes    | Public HTTPS URL of the Frontend                   | `https://app.yourdomain.com`                               |
| `CORS_ORIGINS`         |   Yes    | Allowed frontend origins (comma-separated)         | `https://app.yourdomain.com`                               |
| `DATABASE_URL`         |   Yes    | PostgreSQL connection string                       | `postgresql://user:pass@host:5432/db?schema=public`        |
| `REDIS_URL`            |   Yes    | Redis connection string (supports TLS `rediss://`) | `redis://default:pass@redis-host:6379`                     |
| `GOOGLE_CLIENT_ID`     |   Yes    | Google Cloud OAuth Client ID                       | `xxx.apps.googleusercontent.com`                           |
| `GOOGLE_CLIENT_SECRET` |   Yes    | Google Cloud OAuth Client Secret                   | `GOCSPX-xxxx`                                              |
| `GOOGLE_CALLBACK_URL`  |   Yes    | Exact Google OAuth redirect callback               | `https://api.yourdomain.com/api/v1/auth/google/callback`   |
| `SESSION_SECRET`       |   Yes    | Secret for HMAC session hashing (32+ chars)        | `openssl rand -base64 32`                                  |
| `SESSION_COOKIE_NAME`  |   Yes    | Session cookie identifier                          | `email_scheduler_session`                                  |
| `SESSION_TTL_SECONDS`  |    No    | Session duration in seconds                        | `86400` (24 hours)                                         |
| `SMTP_HOST`            |   Yes*   | Production SMTP host (*if using real SMTP)         | `smtp.sendgrid.net` / `email-smtp.us-east-1.amazonaws.com` |
| `SMTP_PORT`            |   Yes*   | Production SMTP port                               | `587` (TLS) or `465` (SSL)                                 |
| `SMTP_USER`            |   Yes*   | Production SMTP username                           | `apikey`                                                   |
| `SMTP_PASS`            |   Yes*   | Production SMTP password or API token              | `SG.xxxx`                                                  |
| `SMTP_SECURE`          |    No    | True for port 465, false for port 587 (STARTTLS)   | `false`                                                    |
| `DEFAULT_FROM_EMAIL`   |   Yes    | Verified sender email address                      | `notifications@yourdomain.com`                             |
| `DEFAULT_FROM_NAME`    |    No    | Sender name display                                | `Email Scheduler`                                          |
| `WORKER_CONCURRENCY`   |    No    | Concurrent email jobs per worker process           | `5`                                                        |
| `MIN_SEND_DELAY_MS`    |    No    | Minimum spacing between emails per sender          | `2000` (2 seconds)                                         |
| `MAX_EMAILS_PER_HOUR`  |    No    | Default rate limit per sender per hour             | `100`                                                      |

### 4. Database Setup & Production Migrations

Run database migrations against the production database using Prisma's migration deploy command:

```bash
# Run pending Prisma migrations against production DATABASE_URL
pnpm db:migrate:deploy
```

_Note: Never run `prisma db push` in production as it can cause unexpected schema drift or data loss._

### 5. Google Cloud OAuth 2.0 Production Setup

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Under **APIs & Services > Credentials**, select your OAuth 2.0 Client ID.
3. Configure **Authorized JavaScript origins**:
   - `https://app.yourdomain.com`
   - `https://api.yourdomain.com`
4. Configure **Authorized redirect URIs**:
   - `https://api.yourdomain.com/api/v1/auth/google/callback`
5. Save changes. Google OAuth credentials are exchanged strictly server-side by `apps/api`. `GOOGLE_CLIENT_SECRET` is never sent to the browser.

### 6. CORS, Cookies & Domain Configuration

In production, cross-origin cookies between `app.yourdomain.com` and `api.yourdomain.com` require:

- **`CORS_ORIGINS`**: Set to the exact frontend origin `https://app.yourdomain.com`.
- **`credentials: true`**: Handled automatically by Express CORS middleware and frontend fetch client.
- **`HttpOnly` & `SameSite`**: Set to `HttpOnly; SameSite=Lax`.
- **`Secure`**: When `NODE_ENV=production`, cookies are transmitted strictly over HTTPS (`Secure=true`).

### 7. Deployment Options

#### Option A: Docker Compose (All-in-One Production)

```bash
# Set environment variables in .env
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec api pnpm db:migrate:deploy
```

#### Option B: Render / Railway / Fly.io (Multi-Service Platform)

1. **PostgreSQL**: Create a managed database, note `DATABASE_URL`.
2. **Redis**: Create a managed Redis instance, note `REDIS_URL`.
3. **API Web Service**:
   - Root Directory: `.`
   - Build Command: `pnpm install --frozen-lockfile && pnpm --filter @email-scheduler/db run build && pnpm --filter @email-scheduler/api run build`
   - Start Command: `node apps/api/dist/server.js`
   - Pre-Deploy Command: `pnpm db:migrate:deploy`
4. **Worker Background Service**:
   - Root Directory: `.`
   - Build Command: `pnpm install --frozen-lockfile && pnpm --filter @email-scheduler/db run build && pnpm --filter @email-scheduler/worker run build`
   - Start Command: `node apps/worker/dist/worker.js`
5. **Web Static Site**:
   - Root Directory: `.`
   - Build Command: `pnpm install --frozen-lockfile && pnpm --filter @email-scheduler/shared run build && pnpm --filter @email-scheduler/web run build`
   - Publish Directory: `apps/web/dist`
   - Environment Variable: `VITE_API_PUBLIC_URL=https://api.yourdomain.com`

### 8. Health, Readiness & Troubleshooting

- **Liveness Probe**: `GET https://api.yourdomain.com/health` (Returns HTTP 200 `{ "status": "ok" }`).
- **Readiness Probe**: `GET https://api.yourdomain.com/ready` (Returns HTTP 200 `{ "status": "ready", "database": "ok", "redis": "ok" }` or HTTP 503 if PostgreSQL or Redis are unreachable).
- **Stuck PROCESSING Recovery**: If a worker crashes mid-delivery, the next worker claims the job automatically after `WORKER_STALE_PROCESSING_MS` (5 minutes) without database deadlocks.
