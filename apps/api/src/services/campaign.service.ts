import { prisma, Campaign, Email } from '@email-scheduler/db';
import { enqueueEmail } from '@email-scheduler/queue';
import {
  CreateCampaignInput,
  normalizeRecipients,
  PaginationQuery,
} from '../validators/campaign.validator.js';
import { senderService } from './sender.service.js';

export interface CreateCampaignResult {
  campaign: Campaign;
  emails: Email[];
  scheduling: {
    enqueuedCount: number;
    failedEnqueueCount: number;
    allEnqueued: boolean;
  };
}

export interface PaginatedCampaigns {
  campaigns: Campaign[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CampaignService {
  /**
   * Transactionally creates a Campaign and its corresponding Email records,
   * calculating deterministic scheduledAt times and enqueuing BullMQ delayed jobs.
   */
  async createCampaign(userId: string, input: CreateCampaignInput): Promise<CreateCampaignResult> {
    const sender = await senderService.getOrCreateDefaultSender(userId);
    const normalizedRecipients = normalizeRecipients(input.recipients);

    if (normalizedRecipients.length === 0) {
      throw new Error('At least one valid recipient email is required.');
    }

    const startAt = new Date(input.startAt);

    // 1. Transactional Database Persistence
    const { campaign, emails } = await prisma.$transaction(async (tx) => {
      const createdCampaign = await tx.campaign.create({
        data: {
          userId,
          senderId: sender.id,
          subject: input.subject,
          body: input.body,
          startAt,
          delayBetweenEmailsMs: input.delayBetweenEmailsMs,
          hourlyLimit: input.hourlyLimit,
          totalCount: normalizedRecipients.length,
          scheduledCount: normalizedRecipients.length,
          sentCount: 0,
          failedCount: 0,
          status: 'SCHEDULED',
        },
      });

      const emailCreatePromises = normalizedRecipients.map((recipient, index) => {
        const scheduledAt = new Date(startAt.getTime() + index * input.delayBetweenEmailsMs);

        return tx.email.create({
          data: {
            campaignId: createdCampaign.id,
            userId,
            senderId: sender.id,
            recipient,
            subject: input.subject,
            body: input.body,
            scheduledAt,
            status: 'SCHEDULED',
            attemptCount: 0,
          },
        });
      });

      const createdEmails = await Promise.all(emailCreatePromises);

      return { campaign: createdCampaign, emails: createdEmails };
    });

    // 2. BullMQ Delayed Jobs Enqueuing (Only after DB commit)
    let enqueuedCount = 0;
    let failedEnqueueCount = 0;

    for (const email of emails) {
      try {
        const delayMs = Math.max(0, email.scheduledAt.getTime() - Date.now());
        await enqueueEmail(email.id, { delayMs });
        enqueuedCount++;
      } catch (err) {
        failedEnqueueCount++;
        console.error(`[BullMQ Enqueue Error] Failed to enqueue job for email ${email.id}:`, err);
      }
    }

    return {
      campaign,
      emails,
      scheduling: {
        enqueuedCount,
        failedEnqueueCount,
        allEnqueued: failedEnqueueCount === 0,
      },
    };
  }

  /**
   * Retrieves a paginated list of campaigns owned by the user.
   */
  async getCampaigns(userId: string, pagination: PaginationQuery): Promise<PaginatedCampaigns> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.campaign.count({
        where: { userId },
      }),
    ]);

    return {
      campaigns,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves single campaign details with sender and stats, ensuring user ownership.
   */
  async getCampaignById(
    userId: string,
    campaignId: string
  ): Promise<(Campaign & { sender: { id: string; name: string; fromEmail: string } }) | null> {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            fromEmail: true,
          },
        },
      },
    });

    return campaign;
  }
}

export const campaignService = new CampaignService();
