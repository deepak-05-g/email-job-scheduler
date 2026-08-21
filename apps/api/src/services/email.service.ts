import { prisma, Email, EmailStatus } from '@email-scheduler/db';
import { PaginationQuery } from '../validators/campaign.validator.js';

export interface PaginatedEmails {
  emails: Email[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class EmailService {
  /**
   * Retrieves paginated scheduled emails belonging to the user.
   * Includes statuses: SCHEDULED, PROCESSING, RETRY_PENDING.
   * Sorted by scheduledAt ascending.
   */
  async getScheduledEmails(userId: string, pagination: PaginationQuery): Promise<PaginatedEmails> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const scheduledStatuses: EmailStatus[] = ['SCHEDULED', 'PROCESSING', 'RETRY_PENDING'];

    const whereClause = {
      userId,
      status: {
        in: scheduledStatuses,
      },
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: whereClause,
        orderBy: { scheduledAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.email.count({
        where: whereClause,
      }),
    ]);

    return {
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves paginated sent or failed emails belonging to the user.
   * Includes statuses: SENT, FAILED.
   * Sorted newest first (by sentAt, then updatedAt).
   */
  async getSentEmails(userId: string, pagination: PaginationQuery): Promise<PaginatedEmails> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const sentStatuses: EmailStatus[] = ['SENT', 'FAILED'];

    const whereClause = {
      userId,
      status: {
        in: sentStatuses,
      },
    };

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where: whereClause,
        orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.email.count({
        where: whereClause,
      }),
    ]);

    return {
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const emailService = new EmailService();
