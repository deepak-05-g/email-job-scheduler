import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { prisma, User } from '@email-scheduler/db';
import { env } from '@email-scheduler/config';
import { getEmailQueue, getDeterministicJobId } from '@email-scheduler/queue';
import { createApp } from '../app.js';
import { sessionService } from '../services/session.service.js';

const app = createApp();

describe('Campaign & Scheduling API Suite', () => {
  let userA: User;
  let userB: User;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    // 1. Create two test users for authorization/IDOR testing
    userA = await prisma.user.upsert({
      where: { email: 'user.a.campaign@example.com' },
      update: { name: 'User A' },
      create: {
        googleSubjectId: 'google-sub-campaign-a-123',
        email: 'user.a.campaign@example.com',
        name: 'User A',
      },
    });

    userB = await prisma.user.upsert({
      where: { email: 'user.b.campaign@example.com' },
      update: { name: 'User B' },
      create: {
        googleSubjectId: 'google-sub-campaign-b-456',
        email: 'user.b.campaign@example.com',
        name: 'User B',
      },
    });

    // 2. Create valid active sessions for both users
    const sessionA = await sessionService.createSession(userA.id);
    const sessionB = await sessionService.createSession(userB.id);
    tokenA = sessionA.rawToken;
    tokenB = sessionB.rawToken;
  });

  afterAll(async () => {
    // Clean up test users (cascades to sessions, senders, campaigns, emails)
    if (userA) {
      await prisma.user.delete({ where: { id: userA.id } }).catch(() => {});
    }
    if (userB) {
      await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
    }
  });

  describe('1 & 2. Authentication & Authorization Enforcement', () => {
    it('should reject unauthenticated campaign creation with 401', async () => {
      const response = await request(app)
        .post('/api/v1/campaigns')
        .send({
          subject: 'Test Subject',
          body: 'Test Body',
          startAt: new Date(Date.now() + 60000).toISOString(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          recipients: ['user@example.com'],
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject unauthenticated campaign listing with 401', async () => {
      const response = await request(app).get('/api/v1/campaigns');
      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated scheduled email listing with 401', async () => {
      const response = await request(app).get('/api/v1/emails/scheduled');
      expect(response.status).toBe(401);
    });

    it('should reject unauthenticated sent email listing with 401', async () => {
      const response = await request(app).get('/api/v1/emails/sent');
      expect(response.status).toBe(401);
    });
  });

  describe('3 & 4. Payload Validation & Recipient Deduplication', () => {
    it('should reject past startAt timestamp', async () => {
      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours in past

      const response = await request(app)
        .post('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`])
        .send({
          subject: 'Past Campaign',
          body: 'Body',
          startAt: pastDate,
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          recipients: ['valid@example.com'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.details[0].message).toContain('past');
    });

    it('should reject delayBetweenEmailsMs below minimum threshold', async () => {
      const response = await request(app)
        .post('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`])
        .send({
          subject: 'Invalid Delay',
          body: 'Body',
          startAt: new Date(Date.now() + 60000).toISOString(),
          delayBetweenEmailsMs: 500, // min is 2000
          hourlyLimit: 100,
          recipients: ['valid@example.com'],
        });

      expect(response.status).toBe(400);
    });

    it('should reject invalid recipient email format', async () => {
      const response = await request(app)
        .post('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`])
        .send({
          subject: 'Invalid Email',
          body: 'Body',
          startAt: new Date(Date.now() + 60000).toISOString(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          recipients: ['not-an-email', 'valid@example.com'],
        });

      expect(response.status).toBe(400);
    });

    it('should normalize and deduplicate recipients without failing', async () => {
      const futureStart = new Date(Date.now() + 120000);

      const response = await request(app)
        .post('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`])
        .send({
          subject: 'Deduplicated Campaign',
          body: 'Deduplicated Body',
          startAt: futureStart.toISOString(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 50,
          recipients: [
            '  LeadA@EXAMPLE.com  ',
            'leada@example.com',
            'leadb@example.com',
            'LEADB@EXAMPLE.COM',
            'leadc@example.com',
          ],
        });

      expect(response.status).toBe(201);
      // 5 input emails -> 3 unique normalized emails
      expect(response.body.campaign.totalCount).toBe(3);
      expect(response.body.campaign.scheduledCount).toBe(3);

      const emailsInDb = await prisma.email.findMany({
        where: { campaignId: response.body.campaign.id },
      });
      expect(emailsInDb.length).toBe(3);
      expect(emailsInDb.map((e) => e.recipient).sort()).toEqual([
        'leada@example.com',
        'leadb@example.com',
        'leadc@example.com',
      ]);
    });
  });

  describe('5, 6, 7, 8, 9, 10. Scheduling Calculations & BullMQ Delayed Jobs', () => {
    it('should calculate deterministic scheduledAt times and create BullMQ delayed jobs', async () => {
      const startAt = new Date(Date.now() + 300000); // 5 minutes in future
      const delayMs = 3000;

      const response = await request(app)
        .post('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`])
        .send({
          subject: 'BullMQ Delayed Scheduling Test',
          body: 'Testing BullMQ Delayed Jobs',
          startAt: startAt.toISOString(),
          delayBetweenEmailsMs: delayMs,
          hourlyLimit: 100,
          recipients: ['first@example.com', 'second@example.com', 'third@example.com'],
        });

      expect(response.status).toBe(201);
      const campaignId = response.body.campaign.id;

      // 1. Verify PostgreSQL persistence & scheduledAt calculation
      const emails = await prisma.email.findMany({
        where: { campaignId },
        orderBy: { scheduledAt: 'asc' },
      });

      expect(emails.length).toBe(3);
      expect(new Date(emails[0].scheduledAt).getTime()).toBe(startAt.getTime());
      expect(new Date(emails[1].scheduledAt).getTime()).toBe(startAt.getTime() + delayMs);
      expect(new Date(emails[2].scheduledAt).getTime()).toBe(startAt.getTime() + 2 * delayMs);

      // 2. Inspect BullMQ Delayed Jobs (without real-world waiting!)
      const queue = getEmailQueue();

      for (const email of emails) {
        const expectedJobId = getDeterministicJobId(email.id);
        const job = await queue.getJob(expectedJobId);

        expect(job).toBeDefined();
        expect(job?.id).toBe(expectedJobId);
        // Payload must contain ONLY emailId
        expect(job?.data).toEqual({ emailId: email.id });
        expect(Object.keys(job?.data || {})).toEqual(['emailId']);

        // Delay must be positive and close to scheduledAt - now
        expect(job?.opts.delay).toBeGreaterThan(0);
        const approxExpectedDelay = email.scheduledAt.getTime() - Date.now();
        expect(Math.abs((job?.opts.delay || 0) - approxExpectedDelay)).toBeLessThan(5000);
      }
    });
  });

  describe('11 & 12. User Ownership & IDOR Protection', () => {
    let campaignAId: string;

    beforeAll(async () => {
      // Create a campaign owned by User A
      const createRes = await request(app)
        .post('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`])
        .send({
          subject: "User A's Secret Campaign",
          body: 'Top Secret Body',
          startAt: new Date(Date.now() + 60000).toISOString(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 50,
          recipients: ['target@example.com'],
        });
      campaignAId = createRes.body.campaign.id;
    });

    it('User A should be able to view their own campaign details', async () => {
      const response = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}`)
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`]);

      expect(response.status).toBe(200);
      expect(response.body.campaign.id).toBe(campaignAId);
      expect(response.body.campaign.sender).toBeDefined();
    });

    it("User B cannot view User A's campaign details (404 NOT_FOUND)", async () => {
      const response = await request(app)
        .get(`/api/v1/campaigns/${campaignAId}`)
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenB}`]);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it("User B's campaign list should not contain User A's campaigns", async () => {
      const response = await request(app)
        .get('/api/v1/campaigns')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenB}`]);

      expect(response.status).toBe(200);
      const ids = response.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(campaignAId);
    });

    it("User B cannot see User A's scheduled emails", async () => {
      const response = await request(app)
        .get('/api/v1/emails/scheduled')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenB}`]);

      expect(response.status).toBe(200);
      const campaignIds = response.body.data.map((e: { campaignId: string }) => e.campaignId);
      expect(campaignIds).not.toContain(campaignAId);
    });
  });

  describe('13, 14, 15. Pagination & Email Status Filtering', () => {
    beforeAll(async () => {
      // Seed a sent email and a failed email for User A
      const sender = await prisma.sender.findFirst({
        where: { userId: userA.id },
      });

      const campaign = await prisma.campaign.create({
        data: {
          userId: userA.id,
          senderId: sender!.id,
          subject: 'Historical Campaign',
          body: 'Historical Body',
          startAt: new Date(Date.now() - 3600000),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          status: 'COMPLETED',
        },
      });

      await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: userA.id,
          senderId: sender!.id,
          recipient: 'delivered@example.com',
          subject: 'Delivered Email',
          body: 'Body',
          scheduledAt: new Date(Date.now() - 3600000),
          sentAt: new Date(Date.now() - 3500000),
          status: 'SENT',
        },
      });

      await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: userA.id,
          senderId: sender!.id,
          recipient: 'bounced@example.com',
          subject: 'Bounced Email',
          body: 'Body',
          scheduledAt: new Date(Date.now() - 3600000),
          status: 'FAILED',
          failureReason: 'Mailbox not found',
        },
      });
    });

    it('GET /api/v1/emails/scheduled should return only scheduled/processing/retry emails', async () => {
      const response = await request(app)
        .get('/api/v1/emails/scheduled?page=1&limit=10')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.page).toBe(1);

      for (const email of response.body.data) {
        expect(['SCHEDULED', 'PROCESSING', 'RETRY_PENDING']).toContain(email.status);
      }
    });

    it('GET /api/v1/emails/sent should return only SENT and FAILED emails', async () => {
      const response = await request(app)
        .get('/api/v1/emails/sent?page=1&limit=10')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('pagination');

      const statuses = response.body.data.map((e: { status: string }) => e.status);
      expect(statuses).toContain('SENT');
      expect(statuses).toContain('FAILED');

      for (const email of response.body.data) {
        expect(['SENT', 'FAILED']).toContain(email.status);
      }
    });

    it('should paginate campaign listings correctly', async () => {
      const response = await request(app)
        .get('/api/v1/campaigns?page=1&limit=2')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${tokenA}`]);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.limit).toBe(2);
      expect(response.body.pagination.page).toBe(1);
    });
  });
});
