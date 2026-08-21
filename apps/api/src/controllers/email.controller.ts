import { Request, Response } from 'express';
import { paginationQuerySchema } from '../validators/campaign.validator.js';
import { emailService } from '../services/email.service.js';

export class EmailController {
  /**
   * GET /api/v1/emails/scheduled
   * Retrieves paginated list of scheduled/processing emails for the authenticated user.
   */
  async getScheduledEmails(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required.',
          code: 'UNAUTHORIZED',
        },
      });
      return;
    }

    const parseResult = paginationQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        error: {
          message: 'Invalid pagination query parameters.',
          code: 'BAD_REQUEST',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    try {
      const { emails, pagination } = await emailService.getScheduledEmails(
        req.user.id,
        parseResult.data
      );

      res.status(200).json({
        data: emails.map((e) => ({
          id: e.id,
          recipient: e.recipient,
          subject: e.subject,
          scheduledAt: e.scheduledAt.toISOString(),
          status: e.status,
          campaignId: e.campaignId,
          attemptCount: e.attemptCount,
          createdAt: e.createdAt.toISOString(),
        })),
        pagination,
      });
    } catch (error) {
      console.error('[Get Scheduled Emails Error]', error);
      res.status(500).json({
        error: {
          message: 'Failed to retrieve scheduled emails.',
          code: 'INTERNAL_SERVER_ERROR',
        },
      });
    }
  }

  /**
   * GET /api/v1/emails/sent
   * Retrieves paginated list of sent/failed emails for the authenticated user.
   */
  async getSentEmails(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required.',
          code: 'UNAUTHORIZED',
        },
      });
      return;
    }

    const parseResult = paginationQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      res.status(400).json({
        error: {
          message: 'Invalid pagination query parameters.',
          code: 'BAD_REQUEST',
          details: parseResult.error.errors,
        },
      });
      return;
    }

    try {
      const { emails, pagination } = await emailService.getSentEmails(
        req.user.id,
        parseResult.data
      );

      res.status(200).json({
        data: emails.map((e) => ({
          id: e.id,
          recipient: e.recipient,
          subject: e.subject,
          scheduledAt: e.scheduledAt.toISOString(),
          sentAt: e.sentAt ? e.sentAt.toISOString() : null,
          status: e.status,
          campaignId: e.campaignId,
          attemptCount: e.attemptCount,
          failureReason: e.failureReason,
          createdAt: e.createdAt.toISOString(),
        })),
        pagination,
      });
    } catch (error) {
      console.error('[Get Sent Emails Error]', error);
      res.status(500).json({
        error: {
          message: 'Failed to retrieve sent emails.',
          code: 'INTERNAL_SERVER_ERROR',
        },
      });
    }
  }
}

export const emailController = new EmailController();
