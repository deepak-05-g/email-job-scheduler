import { describe, it, expect, afterAll } from 'vitest';
import { Worker } from 'bullmq';
import {
  checkRedisHealth,
  getDeterministicJobId,
  enqueueEmail,
  getEmailQueue,
  closeEmailQueue,
  closeRedisConnection,
  getBullMQConnectionOptions,
  EMAIL_SEND_QUEUE_NAME,
  EmailJobPayload,
} from '../index.js';

describe('Queue Infrastructure', () => {
  afterAll(async () => {
    await closeEmailQueue();
    await closeRedisConnection();
  });

  it('1. should verify Redis connection health', async () => {
    const isHealthy = await checkRedisHealth();
    expect(isHealthy).toBe(true);
  });

  it('2. should initialize BullMQ queue', () => {
    const queue = getEmailQueue();
    expect(queue).toBeDefined();
    expect(queue.name).toBe(EMAIL_SEND_QUEUE_NAME);
  });

  it('3. should generate deterministic job IDs', () => {
    const emailId = 'test-uuid-12345';
    const jobId = getDeterministicJobId(emailId);
    expect(jobId).toBe('email_test-uuid-12345');
  });

  it('4 & 5. should enqueue a test email job containing only emailId', async () => {
    const testEmailId = 'email-payload-test-1';
    const job = await enqueueEmail(testEmailId);

    expect(job).toBeDefined();
    expect(job.id).toBe(getDeterministicJobId(testEmailId));
    expect(job.data).toEqual({ emailId: testEmailId });
    expect(Object.keys(job.data)).toEqual(['emailId']);
  });

  it('6. should use identical deterministic job ID on duplicate enqueue attempts', async () => {
    const testEmailId = 'email-duplicate-test-1';
    const job1 = await enqueueEmail(testEmailId);
    const job2 = await enqueueEmail(testEmailId);

    expect(job1.id).toBe(job2.id);
    expect(job1.id).toBe(getDeterministicJobId(testEmailId));
  });

  it('7 & 8. should allow a worker to start, process job, and shut down cleanly', async () => {
    const testEmailId = 'worker-test-email-999';

    const connection = getBullMQConnectionOptions();
    let processedEmailId: string | null = null;

    const testWorker = new Worker<EmailJobPayload>(
      EMAIL_SEND_QUEUE_NAME,
      async (job) => {
        processedEmailId = job.data.emailId;
      },
      { connection }
    );

    await testWorker.waitUntilReady();
    await enqueueEmail(testEmailId);

    for (let i = 0; i < 50; i++) {
      if (processedEmailId) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(processedEmailId).toBeDefined();
    await testWorker.close(true);
  }, 10000);
});
