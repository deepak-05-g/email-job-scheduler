import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma, User, Sender, Email } from '@email-scheduler/db';
import { getEmailQueue, getDeterministicJobId, enqueueEmail } from '@email-scheduler/queue';
import { mailService, SendMailOptions } from '../services/mail.service.js';
import { rateLimitService } from '../services/rate-limit.service.js';
import { campaignProgressService } from '../services/campaign-progress.service.js';
import { emailProcessingService } from '../services/email-processing.service.js';
import { createWorkerInstance } from '../worker.js';

describe('Worker, SMTP, Idempotency & Distributed Rate Limiting Suite', () => {
  let testUser: User;
  let testSender: Sender;

  beforeAll(async () => {
    // 1. Setup mock test user & sender
    testUser = await prisma.user.upsert({
      where: { email: 'worker.test.user@example.com' },
      update: {},
      create: {
        googleSubjectId: 'google-sub-worker-test-123',
        email: 'worker.test.user@example.com',
        name: 'Worker Test User',
      },
    });

    testSender = await prisma.sender.upsert({
      where: { id: 'test-sender-worker-suite' },
      update: {},
      create: {
        id: 'test-sender-worker-suite',
        userId: testUser.id,
        name: 'Worker Test Sender',
        fromEmail: 'sender@example.com',
        provider: 'ethereal',
        active: true,
      },
    });
  });

  beforeEach(() => {
    // Default fast mock handler for SMTP
    mailService.setMockHandler(async (_opts) => {
      return {
        messageId: `<mock-${Date.now()}@ethereal.email>`,
        previewUrl: `https://ethereal.email/message/mock-${Date.now()}`,
      };
    });
  });

  afterAll(async () => {
    mailService.setMockHandler(null);
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
  });

  describe('1, 2, 3, 4. Email State Verification & Idempotency', () => {
    it('should handle missing email ID safely without crashing', async () => {
      const result = await emailProcessingService.processEmail('non-existent-email-id');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('EMAIL_NOT_FOUND');
    });

    it('should be idempotent and not resend an already SENT email', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Already Sent Campaign',
          body: 'Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          status: 'COMPLETED',
        },
      });

      const sentEmail = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'sent@example.com',
          subject: 'Already Sent Subject',
          body: 'Body',
          scheduledAt: new Date(Date.now() - 5000),
          sentAt: new Date(),
          status: 'SENT',
          attemptCount: 1,
        },
      });

      let smtpCalled = false;
      mailService.setMockHandler(async () => {
        smtpCalled = true;
        return { messageId: 'mock-id' };
      });

      const result = await emailProcessingService.processEmail(sentEmail.id);

      expect(result.success).toBe(true);
      expect(result.alreadySent).toBe(true);
      expect(smtpCalled).toBe(false);
    });

    it('should not resend a terminal FAILED email', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Failed Campaign',
          body: 'Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          status: 'FAILED',
        },
      });

      const failedEmail = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'failed@example.com',
          subject: 'Failed Subject',
          body: 'Body',
          scheduledAt: new Date(Date.now() - 5000),
          status: 'FAILED',
          attemptCount: 3,
          failureReason: 'Mailbox does not exist',
        },
      });

      const result = await emailProcessingService.processEmail(failedEmail.id);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('ALREADY_FAILED');
    });
  });

  describe('5, 6, 7, 8, 9, 10. Atomic Claim, SMTP Delivery & Status Transitions', () => {
    it('should atomically claim, send email via SMTP, update status to SENT, and clear lease', async () => {
      await rateLimitService.resetSenderLimits(testSender.id);

      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Normal Send Campaign',
          body: 'Hello World Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          totalCount: 1,
          scheduledCount: 1,
          status: 'SCHEDULED',
        },
      });

      const email = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'recipient@example.com',
          subject: 'Normal Send Subject',
          body: 'Hello World Body',
          scheduledAt: new Date(),
          status: 'SCHEDULED',
          attemptCount: 0,
        },
      });

      let sentPayload: SendMailOptions | null = null;
      mailService.setMockHandler(async (opts) => {
        sentPayload = opts;
        return {
          messageId: '<test-msg-123@ethereal.email>',
          previewUrl: 'https://ethereal.email/message/test-msg-123',
        };
      });

      const result = await emailProcessingService.processEmail(email.id);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<test-msg-123@ethereal.email>');
      expect(result.previewUrl).toBe('https://ethereal.email/message/test-msg-123');

      // Verify SMTP received correct recipient and from address
      expect(sentPayload).not.toBeNull();
      const capturedPayload = sentPayload as unknown as SendMailOptions;
      expect(capturedPayload.from).toBe(testSender.fromEmail);
      expect(capturedPayload.to).toBe('recipient@example.com');
      expect(capturedPayload.subject).toBe('Normal Send Subject');

      // Verify PostgreSQL state
      const updatedEmail = await prisma.email.findUnique({
        where: { id: email.id },
      });

      expect(updatedEmail?.status).toBe('SENT');
      expect(updatedEmail?.sentAt).toBeDefined();
      expect(updatedEmail?.processingStartedAt).toBeNull();
      expect(updatedEmail?.attemptCount).toBe(1);
      expect(updatedEmail?.failureReason).toBeNull();

      // Verify Campaign state
      const updatedCampaign = await prisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updatedCampaign?.sentCount).toBe(1);
      expect(updatedCampaign?.status).toBe('COMPLETED');
    });

    it('should prevent concurrent workers from claiming the same email twice', async () => {
      await rateLimitService.resetSenderLimits(testSender.id);

      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Concurrency Test',
          body: 'Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          totalCount: 1,
          scheduledCount: 1,
          status: 'SCHEDULED',
        },
      });

      const email = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'concurrent@example.com',
          subject: 'Concurrency Subject',
          body: 'Body',
          scheduledAt: new Date(),
          status: 'SCHEDULED',
          attemptCount: 0,
        },
      });

      // Simulate 3 concurrent workers attempting to process the exact same email
      const results = await Promise.all([
        emailProcessingService.processEmail(email.id),
        emailProcessingService.processEmail(email.id),
        emailProcessingService.processEmail(email.id),
      ]);

      // Exactly ONE worker must succeed, others must be rejected or idempotent
      const successfulSends = results.filter((r) => r.success && !r.alreadySent);
      expect(successfulSends.length).toBe(1);

      // Verify email was sent only once
      const finalEmail = await prisma.email.findUnique({
        where: { id: email.id },
      });
      expect(finalEmail?.status).toBe('SENT');
      expect(finalEmail?.attemptCount).toBe(1);
    });
  });

  describe('11 & 12. Retry Policy & Failure Exhaustion', () => {
    it('should transition to RETRY_PENDING on transient SMTP failure when attempts remain', async () => {
      await rateLimitService.resetSenderLimits(testSender.id);

      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Retry Campaign',
          body: 'Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          status: 'PROCESSING',
        },
      });

      const email = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'retry@example.com',
          subject: 'Retry Subject',
          body: 'Body',
          scheduledAt: new Date(),
          status: 'SCHEDULED',
          attemptCount: 0,
        },
      });

      // Mock SMTP failure
      mailService.setMockHandler(async () => {
        throw new Error('Connection timeout to SMTP server');
      });

      await expect(emailProcessingService.processEmail(email.id)).rejects.toThrow(
        'SMTP_SEND_FAILED'
      );

      const updatedEmail = await prisma.email.findUnique({
        where: { id: email.id },
      });

      expect(updatedEmail?.status).toBe('RETRY_PENDING');
      expect(updatedEmail?.attemptCount).toBe(1);
      expect(updatedEmail?.failureReason).toContain('Connection timeout');
      expect(updatedEmail?.processingStartedAt).toBeNull();
    });

    it('should mark email FAILED when max retry attempts are exhausted', async () => {
      await rateLimitService.resetSenderLimits(testSender.id);

      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Exhaustion Campaign',
          body: 'Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          totalCount: 1,
          scheduledCount: 1,
          status: 'PROCESSING',
        },
      });

      // Email already attempted twice (max is 3)
      const email = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'exhaust@example.com',
          subject: 'Exhaust Subject',
          body: 'Body',
          scheduledAt: new Date(),
          status: 'RETRY_PENDING',
          attemptCount: 2,
        },
      });

      mailService.setMockHandler(async () => {
        throw new Error('Persistent 550 Mailbox unavailable');
      });

      const result = await emailProcessingService.processEmail(email.id);

      expect(result.success).toBe(false);
      expect(result.exhausted).toBe(true);

      const finalEmail = await prisma.email.findUnique({
        where: { id: email.id },
      });

      expect(finalEmail?.status).toBe('FAILED');
      expect(finalEmail?.attemptCount).toBe(3);
      expect(finalEmail?.failureReason).toContain('550 Mailbox unavailable');

      const finalCampaign = await prisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(finalCampaign?.failedCount).toBe(1);
      expect(finalCampaign?.status).toBe('FAILED');
    });
  });

  describe('13, 14, 15, 16. Campaign State Transitions', () => {
    it('should determine status PARTIAL when some emails succeed and some fail', () => {
      const status = campaignProgressService.determineCampaignStatus(
        10, // total
        7, // sent
        3, // failed
        'PROCESSING'
      );
      expect(status).toBe('PARTIAL');
    });

    it('should determine status COMPLETED when all emails succeed', () => {
      const status = campaignProgressService.determineCampaignStatus(5, 5, 0, 'PROCESSING');
      expect(status).toBe('COMPLETED');
    });
  });

  describe('17, 18, 19, 20, 21. Distributed Redis Rate Limiting', () => {
    it('should enforce hourly rate limit in Redis and reschedule when exceeded', async () => {
      const testSenderRate = 'sender-rate-test-1';
      await rateLimitService.resetSenderLimits(testSenderRate);

      // Hourly limit = 2
      const first = await rateLimitService.acquireSendPermission(testSenderRate, 2, 0);
      expect(first.allowed).toBe(true);

      const second = await rateLimitService.acquireSendPermission(testSenderRate, 2, 0);
      expect(second.allowed).toBe(true);

      // 3rd attempt exceeds hourly limit
      const third = await rateLimitService.acquireSendPermission(testSenderRate, 2, 0);
      expect(third.allowed).toBe(false);
      expect(third.reason).toBe('HOURLY_LIMIT_EXCEEDED');
      expect(third.retryAfterMs).toBeGreaterThan(0);
    });

    it('should enforce minimum delay between emails via Redis coordination', async () => {
      const testSenderDelay = 'sender-delay-test-2';
      await rateLimitService.resetSenderLimits(testSenderDelay);

      // 1st email: allowed, sets last-send timestamp
      const first = await rateLimitService.acquireSendPermission(
        testSenderDelay,
        100,
        5000 // 5 second minimum delay
      );
      expect(first.allowed).toBe(true);

      // Immediate 2nd email: rejected due to min-delay not elapsed
      const second = await rateLimitService.acquireSendPermission(testSenderDelay, 100, 5000);
      expect(second.allowed).toBe(false);
      expect(second.reason).toBe('MIN_DELAY_NOT_MET');
      expect(second.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('24. Stale Processing Recovery', () => {
    it('should recover an email stuck in PROCESSING if lease is older than threshold', async () => {
      await rateLimitService.resetSenderLimits(testSender.id);

      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Stale Recovery Campaign',
          body: 'Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: 100,
          status: 'PROCESSING',
        },
      });

      // Email stuck in PROCESSING 10 minutes ago
      const staleEmail = await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: testUser.id,
          senderId: testSender.id,
          recipient: 'stale@example.com',
          subject: 'Stale Subject',
          body: 'Body',
          scheduledAt: new Date(Date.now() - 600000),
          status: 'PROCESSING',
          processingStartedAt: new Date(Date.now() - 600000), // 10 mins ago
          attemptCount: 1,
        },
      });

      const result = await emailProcessingService.processEmail(staleEmail.id);

      expect(result.success).toBe(true);

      const recoveredEmail = await prisma.email.findUnique({
        where: { id: staleEmail.id },
      });
      expect(recoveredEmail?.status).toBe('SENT');
      expect(recoveredEmail?.sentAt).toBeDefined();
    });
  });

  describe('21 & 25. Worker Concurrency & Pipeline Integration', () => {
    it('should allow configurable worker concurrency', async () => {
      const workerInstance = createWorkerInstance(3);
      expect(workerInstance.opts.concurrency).toBe(3);
      await workerInstance.close();
    });

    it('Realistic Integration Test: should process 5-recipient campaign through pipeline with correct job payload and completion', async () => {
      await rateLimitService.resetSenderLimits(testSender.id);

      const campaign = await prisma.campaign.create({
        data: {
          userId: testUser.id,
          senderId: testSender.id,
          subject: 'Integration Pipeline Campaign',
          body: 'Integration Pipeline Body',
          startAt: new Date(),
          delayBetweenEmailsMs: 0, // No delay for fast testing
          hourlyLimit: 50,
          totalCount: 5,
          scheduledCount: 5,
          sentCount: 0,
          failedCount: 0,
          status: 'SCHEDULED',
        },
      });

      const emails: Email[] = [];
      const queue = getEmailQueue();

      for (let i = 1; i <= 5; i++) {
        const email = await prisma.email.create({
          data: {
            campaignId: campaign.id,
            userId: testUser.id,
            senderId: testSender.id,
            recipient: `pipeline.lead${i}@example.com`,
            subject: 'Integration Pipeline Campaign',
            body: 'Integration Pipeline Body',
            scheduledAt: new Date(),
            status: 'SCHEDULED',
            attemptCount: 0,
          },
        });
        emails.push(email);

        // Enqueue BullMQ delayed job with minimal payload
        await enqueueEmail(email.id);
      }

      // Verify 5 Email records exist
      expect(emails.length).toBe(5);

      // Verify 5 BullMQ jobs exist with ONLY emailId in payload
      for (const email of emails) {
        const jobId = getDeterministicJobId(email.id);
        const job = await queue.getJob(jobId);
        expect(job).toBeDefined();
        expect(job?.data).toEqual({ emailId: email.id });
      }

      // Create worker instance to process queue
      const worker = createWorkerInstance(5);

      // Wait for all 5 jobs to be processed
      const maxWait = Date.now() + 10000;
      while (Date.now() < maxWait) {
        const check = await prisma.campaign.findUnique({
          where: { id: campaign.id },
        });
        if (check?.status === 'COMPLETED') {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      await worker.close();

      // Verify all 5 emails are SENT with sentAt populated
      const processedEmails = await prisma.email.findMany({
        where: { campaignId: campaign.id },
      });
      expect(processedEmails.length).toBe(5);
      for (const email of processedEmails) {
        expect(email.status).toBe('SENT');
        expect(email.sentAt).toBeDefined();
        expect(email.processingStartedAt).toBeNull();
        expect(email.attemptCount).toBe(1);
      }

      // Verify final campaign status is COMPLETED
      const finalCampaign = await prisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(finalCampaign?.sentCount).toBe(5);
      expect(finalCampaign?.failedCount).toBe(0);
      expect(finalCampaign?.status).toBe('COMPLETED');
    });
  });
});
