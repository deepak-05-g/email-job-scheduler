import { prisma } from '@email-scheduler/db';
import { env } from '@email-scheduler/config';
import { enqueueEmail } from '@email-scheduler/queue';
import { mailService } from './mail.service.js';
import { rateLimitService } from './rate-limit.service.js';
import { campaignProgressService } from './campaign-progress.service.js';

export interface ProcessEmailResult {
  success: boolean;
  alreadySent?: boolean;
  rateLimited?: boolean;
  retryAfterMs?: number;
  reason?: string;
  messageId?: string;
  previewUrl?: string | null;
  error?: string;
  exhausted?: boolean;
}

export class EmailProcessingService {
  /**
   * Main pipeline for processing an email job:
   * 1. Atomic claim & stale recovery
   * 2. Distributed rate limit acquisition (hourly & min-delay)
   * 3. Ethereal SMTP delivery
   * 4. State updates and campaign progress tracking
   */
  async processEmail(emailId: string): Promise<ProcessEmailResult> {
    // 1. Fetch Email with Campaign and Sender info
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: {
        campaign: true,
        sender: true,
      },
    });

    if (!email) {
      console.warn(`[Worker] Email with ID ${emailId} not found. Skipping.`);
      return { success: false, reason: 'EMAIL_NOT_FOUND' };
    }

    // 2. Idempotency Check
    if (email.status === 'SENT') {
      console.log(
        `[Worker] Email ${emailId} has already been sent at ${email.sentAt}. Idempotent skip.`
      );
      return { success: true, alreadySent: true };
    }

    if (email.status === 'FAILED') {
      console.log(`[Worker] Email ${emailId} is in terminal FAILED status. Skipping.`);
      return { success: false, reason: 'ALREADY_FAILED' };
    }

    // 3. Stale Processing Verification
    const now = Date.now();
    const staleThresholdMs = env.WORKER_STALE_PROCESSING_MS || 30000;

    if (email.status === 'PROCESSING' && email.processingStartedAt) {
      const leaseAge = now - email.processingStartedAt.getTime();
      if (leaseAge < staleThresholdMs) {
        console.log(
          `[Worker] Email ${emailId} is actively being processed by another worker (lease age: ${leaseAge}ms). Skipping.`
        );
        return { success: false, reason: 'ALREADY_PROCESSING' };
      }
      console.warn(
        `[Worker] Stale lease detected on Email ${emailId} (${leaseAge}ms old). Proceeding with recovery claim.`
      );
    }

    // 4. Atomic Database Claim
    const claimResult = await prisma.email.updateMany({
      where: {
        id: emailId,
        OR: [
          { status: 'SCHEDULED' },
          { status: 'RETRY_PENDING' },
          {
            status: 'PROCESSING',
            processingStartedAt: {
              lt: new Date(now - staleThresholdMs),
            },
          },
        ],
      },
      data: {
        status: 'PROCESSING',
        processingStartedAt: new Date(now),
        attemptCount: { increment: 1 },
      },
    });

    if (claimResult.count === 0) {
      console.log(
        `[Worker] Lost atomic claim race for Email ${emailId}. Another worker claimed it.`
      );
      return { success: false, reason: 'CLAIM_RACE_LOST' };
    }

    // Update campaign status to PROCESSING if needed
    await campaignProgressService.markCampaignProcessing(email.campaignId);

    // 5. Distributed Rate Limiting (Redis-backed)
    const rateLimit = await rateLimitService.acquireSendPermission(
      email.senderId,
      email.campaign.hourlyLimit,
      email.campaign.delayBetweenEmailsMs
    );

    if (!rateLimit.allowed) {
      const retryAfterMs = rateLimit.retryAfterMs || 5000;
      console.log(
        `[Worker] Rate limit active (${rateLimit.reason}) for sender ${email.senderId}. Postponing email ${emailId} by ${retryAfterMs}ms.`
      );

      // Revert processing state to SCHEDULED for next window
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SCHEDULED',
          processingStartedAt: null,
          attemptCount: { decrement: 1 }, // Do not count rate-limit postponement as failure attempt
        },
      });

      // Reschedule delayed BullMQ job
      await enqueueEmail(emailId, { delayMs: retryAfterMs });

      return {
        success: false,
        rateLimited: true,
        retryAfterMs,
        reason: rateLimit.reason,
      };
    }

    // 6. Ethereal SMTP Send Attempt
    try {
      const fromAddress = email.sender.fromEmail || env.DEFAULT_FROM_EMAIL;

      const sendResult = await mailService.sendEmail({
        from: fromAddress,
        to: email.recipient,
        subject: email.subject,
        body: email.body,
      });

      // 7. Update Database on Success
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          processingStartedAt: null,
          failureReason: null,
        },
      });

      await campaignProgressService.recordEmailSent(email.campaignId);

      console.log(
        `[Worker] Successfully sent email ${emailId} to ${email.recipient}. MsgId: ${sendResult.messageId}`
      );

      return {
        success: true,
        messageId: sendResult.messageId,
        previewUrl: sendResult.previewUrl,
      };
    } catch (sendErr) {
      const errorMsg = sendErr instanceof Error ? sendErr.message : 'Unknown SMTP Error';
      console.error(`[Worker] Failed to send email ${emailId}: ${errorMsg}`);

      // Check current attempt count
      const updatedEmail = await prisma.email.findUnique({
        where: { id: emailId },
        select: { attemptCount: true },
      });

      const currentAttempts = updatedEmail?.attemptCount || 1;
      const maxAttempts = env.EMAIL_JOB_ATTEMPTS || 3;

      if (currentAttempts < maxAttempts) {
        // Mark for retry
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'RETRY_PENDING',
            processingStartedAt: null,
            failureReason: errorMsg,
          },
        });

        // Rethrow error so BullMQ worker initiates backoff retry
        throw new Error(`SMTP_SEND_FAILED: ${errorMsg}`);
      } else {
        // Terminal Failure
        await prisma.email.update({
          where: { id: emailId },
          data: {
            status: 'FAILED',
            processingStartedAt: null,
            failureReason: errorMsg,
          },
        });

        await campaignProgressService.recordEmailFailed(email.campaignId);

        return {
          success: false,
          error: errorMsg,
          exhausted: true,
        };
      }
    }
  }
}

export const emailProcessingService = new EmailProcessingService();
