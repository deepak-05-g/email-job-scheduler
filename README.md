# OutBox — Full-Stack Email Job Scheduler

[![Live Frontend](https://img.shields.io/badge/Frontend-Vercel-black?style=flat&logo=vercel)](https://email-job-scheduler-web-three.vercel.app)
[![Live Backend](https://img.shields.io/badge/Backend-Render-46E3B7?style=flat&logo=render)](https://email-job-scheduler-576n.onrender.com)
[![Database](https://img.shields.io/badge/Database-Neon%20PostgreSQL-00E599?style=flat&logo=postgresql)](https://neon.tech)
[![Queue](https://img.shields.io/badge/Queue-Upstash%20Redis-FF1493?style=flat&logo=redis)](https://upstash.com)
[![Tests](https://img.shields.io/badge/Tests-83%20Passing-brightgreen?style=flat)]()

A production-grade, distributed Email Job Scheduler built with Node.js, Express, TypeScript, BullMQ, Redis, PostgreSQL (Prisma), and a clean React (Vite) interface styled after the **ReachInbox / OutBox Figma Design System**.

---

## 🌐 Live Deployments

- **Frontend (Vercel)**: [https://email-job-scheduler-web-three.vercel.app](https://email-job-scheduler-web-three.vercel.app)
- **Backend API (Render)**: [https://email-job-scheduler-576n.onrender.com](https://email-job-scheduler-576n.onrender.com)
- **Health Check**: [https://email-job-scheduler-576n.onrender.com/health](https://email-job-scheduler-576n.onrender.com/health)
- **Readiness Check**: [https://email-job-scheduler-576n.onrender.com/ready](https://email-job-scheduler-576n.onrender.com/ready)

---

## 📑 Table of Contents

1. [Features Implemented](#-features-implemented)
   - [Backend Features](#backend-features)
   - [Frontend Features](#frontend-features)
2. [Architecture Overview](#-architecture-overview)
   - [How Scheduling Works](#1-how-scheduling-works)
   - [How Persistence on Restart is Handled](#2-how-persistence-on-restart-is-handled)
   - [How Rate Limiting & Concurrency are Implemented](#3-how-rate-limiting--concurrency-are-implemented)
3. [Ethereal Email & Environment Setup](#-ethereal-email--environment-setup)
4. [How to Run Locally](#-how-to-run-locally)
   - [Prerequisites](#prerequisites)
   - [Running the Backend](#running-the-backend)
   - [Running the Frontend](#running-the-frontend)
   - [Running the Full Monorepo Concurrently](#running-the-full-monorepo-concurrently)
5. [Automated Testing & Quality Checks](#-automated-testing--quality-checks)
6. [Monorepo Structure](#-monorepo-structure)

---

## ✨ Features Implemented

### Backend Features

| Feature | Description | Implementation Details |
| :--- | :--- | :--- |
| **Email Job Scheduler** | Delayed job dispatching based on user-selected timestamps or immediate dispatch. | BullMQ delayed jobs (`delay = Math.max(0, scheduledAt - Date.now())`), automatic database state transitions (`SCHEDULED` $\rightarrow$ `QUEUED` $\rightarrow$ `SENDING` $\rightarrow$ `SENT` / `FAILED`). |
| **Restart Persistence** | Jobs, campaigns, and queues safely survive server restarts, worker crashes, or node failure. | Redis AOF/RDB persistence for BullMQ state + PostgreSQL database records as source-of-truth. Automatic job rehydration on startup. |
| **Hourly Rate Limiter** | Enforces a strict maximum number of emails dispatched per hour (e.g., 100 emails/hr). | Built-in BullMQ Queue Rate Limiter (`limiter: { max: 100, duration: 3600000 }`) preventing provider throttling or IP blacklisting. |
| **Sender Concurrency & Delays** | Configurable worker concurrency and minimum spacing between emails from the same sender. | BullMQ worker concurrency (`concurrency: 5`), per-sender Redis timestamp tracking enforcing a minimum 2,000ms delay between consecutive dispatches. |
| **Google OAuth 2.0 & Sessions** | Real Google authentication with secure server-side session management. | Authorization code flow with single-use cryptographic `state` verification, SHA-256 session token hashing, and `SameSite=None; Secure` HTTP-only cookies. |
| **Multi-Recipient Batch Processing** | Processes individual recipient dispatch tasks independently with individual retry logic. | Exponential backoff (`attempts: 3`, initial delay 5000ms), error logging, and individual email delivery status tracking. |
| **Health & Readiness Probes** | Zero-downtime container monitoring and live health status. | `/health` (liveness probe) and `/ready` (verifies live PostgreSQL and Redis connections simultaneously). |

### Frontend Features

| Feature | Description | Implementation Details |
| :--- | :--- | :--- |
| **Figma Email Client UI** | Minimal, clean, white/light email dashboard interface matching ReachInbox/OutBox Figma design. | Polished sidebar navigation (OutBox brand, Inbox, Sent, Drafts, Scheduled, Campaigns, Settings), user profile avatar, and responsive layout. |
| **Google OAuth Login Screen** | Single-click Google login card with clean brand badge and terms notices. | Direct redirect to Google OAuth flow with error banner handling (`oauth_failed`, `invalid_state`). |
| **Compose New Email Modal** | Modal dialog for creating and scheduling email campaigns. | Sender selector, recipient chips, subject line, body text area, and interactive schedule popover (hourly/instant presets or custom picker). |
| **CSV / TXT Lead File Upload** | File upload supporting client-side parsing of recipient lead lists. | Drag-and-drop & file picker (`.csv`, `.txt`), 5MB client-side size limit, real-time recipient detection counter badge, deduplication counting, and invalid format notices. |
| **Real-Time Analytics Dashboard** | SaaS analytics dashboard displaying key campaign and delivery metrics. | Metric stat cards (Total Sent, Scheduled, Pending, Failed, Success Rate), recent activity timeline, and quick-action buttons. |
| **Campaigns & Details View** | List of all campaigns with progress bars and deep inspection page. | Status badges (`SCHEDULED`, `PROCESSING`, `COMPLETED`, `FAILED`), recipient breakdown, send time logs, and error inspector. |
| **Scheduled & Sent Emails Tables** | Dedicated tabular views for upcoming and past email dispatches. | Filterable tables, recipient addresses, scheduled vs. actual delivery timestamps, and pagination controls. |

---

## 🏗️ Architecture Overview

```mermaid
flowchart TD
    subgraph Client ["Client Layer (Frontend)"]
        UI["Vite + React SPA (Vercel)"]
        Parser["CSV / TXT Lead Parser & Counter"]
    end

    subgraph API ["API Layer (Express on Render)"]
        Auth["Google OAuth 2.0 & Session Auth"]
        CampController["Campaign & Email REST API"]
        ReadyCheck["Health & Ready Probes"]
    end

    subgraph QueueLayer ["Queue & Storage Layer"]
        DB[("Neon PostgreSQL (Prisma ORM)")]
        RedisQueue[("Upstash Redis (BullMQ Queue)")]
    end

    subgraph Worker ["Worker Layer (BullMQ Consumer)"]
        Consumer["BullMQ Worker (Concurrency: 5)"]
        Limiter["Rate Limiter (100 emails/hr)"]
        DelayManager["Per-Sender Inter-Send Delays (2000ms)"]
        Mailer["Nodemailer (Ethereal / SMTP Transport)"]
    end

    UI -->|HTTPS / REST| CampController
    UI -->|OAuth Code Flow| Auth
    Parser --> UI

    CampController -->|Persist Metadata| DB
    CampController -->|Add Delayed Jobs| RedisQueue

    RedisQueue -->|Pull Jobs| Consumer
    Consumer --> Limiter
    Consumer --> DelayManager
    DelayManager --> Mailer
    Mailer -->|Update Delivery Status| DB
```

---

### 1. How Scheduling Works

1. **Campaign Creation**: When a user composes an email and chooses a schedule time $T_{target}$, the client sends the payload to `POST /api/v1/campaigns`.
2. **Database Record Creation**: The API creates the `Campaign` record in PostgreSQL with status `SCHEDULED`, and inserts corresponding `Email` records for each recipient in `PENDING` state.
3. **BullMQ Job Delay Calculation**: For each recipient, a job is added to the BullMQ queue with a computed delay:
   $$\text{delay} = \max(0, T_{\text{target}} - T_{\text{now}})$$
4. **BullMQ Delayed Set**: Redis stores the job in a sorted set (`bull:email-queue:delayed`) indexed by the execution timestamp.
5. **Worker Execution**: When the delay elapses, BullMQ automatically transitions the job from `delayed` to `waiting` $\rightarrow$ `active`. The worker picks up the job, updates the database status to `SENDING`, and dispatches the email via SMTP/Ethereal.

---

### 2. How Persistence on Restart is Handled

- **Redis Queue State**: BullMQ stores all job payloads, scheduled delays, retry counters, and lock states in Redis data structures. If the API or Worker crashes, Redis retains the exact queue state. Upon restart, BullMQ immediately resumes processing remaining and delayed jobs without duplicates.
- **Database Source-of-Truth**: All campaign metadata, recipient states (`PENDING`, `SENDING`, `SENT`, `FAILED`), attempt counts, error traces, and timestamps are persisted in PostgreSQL.
- **Startup Rehydration & Recovery**: During worker startup, the system verifies unprocessed scheduled emails against the queue to ensure zero lost jobs.

---

### 3. How Rate Limiting & Concurrency are Implemented

- **Global Hourly Rate Limiting**: The BullMQ queue is configured with a sliding window rate limiter:
  ```ts
  limiter: {
    max: 100,          // Maximum 100 jobs
    duration: 3600000, // Per 1 hour (in ms)
  }
  ```
  If 100 emails are sent within an hour, additional jobs automatically wait in the queue until the rate limit window rolls over.
- **Worker Concurrency**: The worker runs with `concurrency: 5`, allowing up to 5 email jobs to be processed concurrently across separate recipients.
- **Per-Sender Minimum Delay (Anti-Spam Spacing)**: To prevent burst sending from a single mailbox, the worker maintains a Redis key `sender:last_sent:<senderId>`. Before sending, the worker enforces a minimum 2,000ms delay between consecutive emails from the same sender:
  ```ts
  const now = Date.now();
  const timeSinceLastSend = now - lastSentTimestamp;
  if (timeSinceLastSend < MIN_SEND_DELAY_MS) {
    await sleep(MIN_SEND_DELAY_MS - timeSinceLastSend);
  }
  ```

---

## 📧 Ethereal Email & Environment Setup

### 1. Generating Free Ethereal Email Credentials

[Ethereal Email](https://ethereal.email) is a fake SMTP service for testing email delivery without sending real spam.

1. Open your browser and navigate to [https://ethereal.email/create](https://ethereal.email/create).
2. Click **"Create Ethereal Account"**.
3. Copy the generated **Account Email**, **Password**, **SMTP Host** (`smtp.ethereal.email`), and **Port** (`587`).
4. Every sent email will produce a preview URL in the worker console logs (e.g., `https://ethereal.email/message/...`).

---

### 2. Environment Variables Reference

Create a `.env` file at the repository root by copying `.env.example`:

```bash
cp .env.example .env
```

| Variable | Required | Description | Example (Local / Production) |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | Environment mode (`development` or `production`) | `production` |
| `PORT` | Yes | HTTP port for Express API | `10000` (Render) or `3001` (Local) |
| `API_PUBLIC_URL` | Yes | Public URL of the backend API service | `https://email-job-scheduler-576n.onrender.com` |
| `WEB_PUBLIC_URL` | Yes | Public URL of the frontend application | `https://email-job-scheduler-web-three.vercel.app` |
| `CORS_ORIGINS` | Yes | Comma-separated allowed frontend origins | `https://email-job-scheduler-web-three.vercel.app` |
| `DATABASE_URL` | Yes | PostgreSQL connection string (Prisma) | `postgresql://user:pass@host/db?sslmode=require` |
| `REDIS_URL` | Yes | Redis connection URL (`redis://` or `rediss://` TLS) | `rediss://default:pass@host:6379` |
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud OAuth 2.0 Web Client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud OAuth 2.0 Client Secret | `GOCSPX-xxx` |
| `GOOGLE_CALLBACK_URL` | Yes | Authorized OAuth redirect URI | `https://email-job-scheduler-576n.onrender.com/api/v1/auth/google/callback` |
| `ETHEREAL_USER` | No | Ethereal SMTP username (auto-generated if empty) | `hosea32@ethereal.email` |
| `ETHEREAL_PASS` | No | Ethereal SMTP password | `WPUNmEzYDeXA5sdcdY` |
| `DEFAULT_FROM_EMAIL` | No | Default From email address | `hosea32@ethereal.email` |
| `WORKER_CONCURRENCY` | No | Concurrent email jobs per worker | `5` |
| `MIN_SEND_DELAY_MS` | No | Minimum spacing between emails from same sender | `2000` |
| `MAX_EMAILS_PER_HOUR` | No | Max emails allowed per hour (Queue rate limiter) | `100` |

---

## 💻 How to Run Locally

### Prerequisites

- **Node.js**: `v20.x` or `v22.x`
- **pnpm**: `v9.x` (`npm i -g pnpm`)
- **Docker Desktop** (for local PostgreSQL & Redis instances)

---

### Step 1: Clone & Install Dependencies

```bash
git clone https://github.com/deepak-05-g/email-job-scheduler.git
cd email-job-scheduler
pnpm install
```

---

### Step 2: Start Local Infrastructure (Docker)

Start local PostgreSQL and Redis containers:

```bash
docker compose up -d
```

---

### Step 3: Run Database Migrations

Apply Prisma database schema and generate Prisma client:

```bash
pnpm --filter @email-scheduler/db run db:push
```

---

### Running the Backend

In separate terminal windows (or using the concurrent script):

```bash
# Terminal 1: Start Express API (Port 3001)
pnpm --filter @email-scheduler/api run dev

# Terminal 2: Start BullMQ Queue Worker
pnpm --filter @email-scheduler/worker run dev
```

---

### Running the Frontend

```bash
# Terminal 3: Start Vite Web Client (Port 3000)
pnpm --filter @email-scheduler/web run dev
```

Open your browser at **`http://localhost:3000`**.

---

### Running the Full Monorepo Concurrently

To run the API, Worker, and Web frontend all in one command:

```bash
pnpm run dev
```

---

## 🧪 Automated Testing & Quality Checks

The repository includes comprehensive automated test suites spanning all layers (unit, integration, queues, database, client lead parsing):

```bash
# Run all workspace test suites (83 tests)
pnpm test

# Run TypeScript typechecks across all 8 projects
pnpm typecheck

# Build all packages and applications for production
pnpm build
```

---

## 📁 Monorepo Structure

```text
email-job-scheduler/
├── apps/
│   ├── api/             # Express HTTP API (OAuth, Sessions, Campaigns, REST controllers)
│   ├── worker/          # BullMQ Queue Worker (Rate limiting, delay spacing, Nodemailer)
│   └── web/             # React 19 + Vite SPA (Figma light theme, CSV lead parser)
├── packages/
│   ├── config/          # Centralized Zod schema & environment config validation
│   ├── db/              # PostgreSQL client, Prisma schema, and migrations
│   ├── queue/           # BullMQ queue definitions, Redis connection, and TLS helpers
│   └── shared/          # Shared TypeScript interfaces, DTOs, and API responses
├── docker-compose.yml   # Local PostgreSQL & Redis infrastructure
├── vercel.json          # Vercel deployment configuration with SPA routing rewrites
├── package.json         # Workspace root package scripts
└── pnpm-workspace.yaml  # pnpm workspace definition
```

---

## 📄 License

MIT License © 2026 Deepak Gowda
