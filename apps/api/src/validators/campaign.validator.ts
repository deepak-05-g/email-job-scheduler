import { z } from 'zod';
import { env } from '@email-scheduler/config';

export const createCampaignSchema = z.object({
  subject: z
    .string({ required_error: 'Subject is required' })
    .trim()
    .min(1, 'Subject cannot be empty')
    .max(500, 'Subject cannot exceed 500 characters'),
  body: z.string({ required_error: 'Body is required' }).min(1, 'Body cannot be empty'),
  startAt: z
    .string({ required_error: 'startAt is required' })
    .datetime({ message: 'startAt must be a valid ISO-8601 datetime' })
    .refine(
      (val) => {
        const date = new Date(val);
        // Allow up to 1 minute grace period for network latency / instantaneous scheduling
        const gracePeriod = Date.now() - 60 * 1000;
        return date.getTime() >= gracePeriod;
      },
      { message: 'startAt cannot be in the past' }
    ),
  delayBetweenEmailsMs: z
    .number({ required_error: 'delayBetweenEmailsMs is required' })
    .int('delayBetweenEmailsMs must be an integer')
    .min(env.MIN_SEND_DELAY_MS, `delayBetweenEmailsMs must be at least ${env.MIN_SEND_DELAY_MS}ms`),
  hourlyLimit: z
    .number({ required_error: 'hourlyLimit is required' })
    .int('hourlyLimit must be an integer')
    .positive('hourlyLimit must be greater than 0'),
  recipients: z
    .array(
      z.string().trim().email('Invalid email address format').max(320, 'Email address is too long'),
      { required_error: 'Recipients are required' }
    )
    .min(1, 'At least one recipient is required')
    .max(
      env.MAX_RECIPIENTS_PER_CAMPAIGN,
      `Maximum recipients per campaign is ${env.MAX_RECIPIENTS_PER_CAMPAIGN}`
    ),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Normalizes email addresses by trimming, lowercasing, and removing duplicates
 * while preserving original order.
 */
export const normalizeRecipients = (recipients: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of recipients) {
    const email = raw.trim().toLowerCase();
    if (email && !seen.has(email)) {
      seen.add(email);
      normalized.push(email);
    }
  }

  return normalized;
};
