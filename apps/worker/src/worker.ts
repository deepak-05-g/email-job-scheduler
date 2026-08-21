import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { env } from '@email-scheduler/config';
import {
  EMAIL_SEND_QUEUE_NAME,
  EmailJobPayload,
  getBullMQConnectionOptions,
  closeRedisConnection,
} from '@email-scheduler/queue';
import { prisma } from '@email-scheduler/db';
import { emailProcessingService, ProcessEmailResult } from './services/email-processing.service.js';
import { logger } from './utils/logger.js';

let worker: Worker<EmailJobPayload> | null = null;
let isShuttingDown = false;

/**
 * Creates and configures a BullMQ Worker instance for processing email sending jobs.
 */
export const createWorkerInstance = (concurrency?: number): Worker<EmailJobPayload> => {
  const connectionOptions = getBullMQConnectionOptions();
  const workerConcurrency = concurrency || env.WORKER_CONCURRENCY || 5;

  const newWorker = new Worker<EmailJobPayload>(
    EMAIL_SEND_QUEUE_NAME,
    async (job: Job<EmailJobPayload>): Promise<ProcessEmailResult> => {
      const emailId = job.data?.emailId;
      if (!emailId) {
        logger.warn('Received job without emailId in payload', { jobId: job.id });
        return { success: false, reason: 'INVALID_PAYLOAD' };
      }

      logger.info(`Processing email sending job`, {
        jobId: job.id,
        emailId,
        attempt: job.attemptsMade + 1,
      });

      return await emailProcessingService.processEmail(emailId);
    },
    {
      connection: connectionOptions,
      concurrency: workerConcurrency,
    }
  );

  newWorker.on('active', (job: Job<EmailJobPayload>) => {
    logger.debug(`Job is now active`, { jobId: job.id });
  });

  newWorker.on('completed', (job: Job<EmailJobPayload>, result: ProcessEmailResult) => {
    logger.info(`Job completed`, {
      jobId: job.id,
      success: result?.success,
      reason: result?.reason,
    });
  });

  newWorker.on('failed', (job: Job<EmailJobPayload> | undefined, err: Error) => {
    logger.error(`Job failed with error`, {
      jobId: job?.id,
      error: err.message,
    });
  });

  newWorker.on('error', (err: Error) => {
    logger.error(`Worker error`, { error: err.message });
  });

  return newWorker;
};

export const startWorkerService = (): Worker<EmailJobPayload> => {
  if (!worker) {
    worker = createWorkerInstance();
    logger.info(
      `Worker service started successfully listening on queue "${EMAIL_SEND_QUEUE_NAME}" with concurrency ${env.WORKER_CONCURRENCY}.`
    );
  }
  return worker;
};

export const shutdownWorkerService = async (signal?: string): Promise<void> => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Shutdown signal ${signal || 'INITIATED'} received. Closing worker...`);

  try {
    if (worker) {
      await worker.close();
      worker = null;
      logger.info('BullMQ Worker closed.');
    }

    await closeRedisConnection();
    logger.info('Redis connections closed.');

    await prisma.$disconnect();
    logger.info('Prisma connection closed.');

    logger.info('Graceful shutdown complete.');
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error during shutdown';
    logger.error(`Worker shutdown error: ${msg}`);
  }
};

// Process termination signal handlers
process.on('SIGTERM', () => {
  shutdownWorkerService('SIGTERM').then(() => process.exit(0));
});

process.on('SIGINT', () => {
  shutdownWorkerService('SIGINT').then(() => process.exit(0));
});

// Auto-start worker in non-test mode
if (process.env.NODE_ENV !== 'test' && env.NODE_ENV !== 'test') {
  startWorkerService();
}
