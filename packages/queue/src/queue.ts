import { Queue, Job } from 'bullmq';
import { getBullMQConnectionOptions } from './connection.js';
import { EMAIL_SEND_QUEUE_NAME, EmailJobPayload, EnqueueEmailOptions } from './types.js';

export const getDeterministicJobId = (emailId: string): string => {
  return `email_${emailId}`;
};

let emailQueueInstance: Queue<EmailJobPayload> | null = null;

export const getEmailQueue = (): Queue<EmailJobPayload> => {
  if (!emailQueueInstance) {
    const connection = getBullMQConnectionOptions();
    emailQueueInstance = new Queue<EmailJobPayload>(EMAIL_SEND_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: parseInt(process.env.EMAIL_JOB_ATTEMPTS || '3', 10),
        backoff: {
          type: 'exponential',
          delay: parseInt(process.env.EMAIL_JOB_BACKOFF_MS || '5000', 10),
        },
        removeOnComplete: {
          count: parseInt(process.env.COMPLETED_JOB_RETENTION_COUNT || '1000', 10),
        },
        removeOnFail: {
          count: parseInt(process.env.FAILED_JOB_RETENTION_COUNT || '5000', 10),
        },
      },
    });
  }
  return emailQueueInstance;
};

export const enqueueEmail = async (
  emailId: string,
  options?: EnqueueEmailOptions
): Promise<Job<EmailJobPayload>> => {
  const queue = getEmailQueue();
  const jobId = getDeterministicJobId(emailId);

  const job = await queue.add(
    'send-email-job',
    { emailId },
    {
      jobId,
      delay: options?.delayMs && options.delayMs > 0 ? options.delayMs : 0,
    }
  );

  return job;
};

export const closeEmailQueue = async (): Promise<void> => {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
  }
};
