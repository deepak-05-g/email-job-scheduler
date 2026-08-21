import { Request, Response } from 'express';
import { createCampaignSchema, paginationQuerySchema } from '../validators/campaign.validator.js';
import { campaignService } from '../services/campaign.service.js';

export class CampaignController {
  /**
   * POST /api/v1/campaigns
   * Creates a campaign and schedules delayed email jobs in BullMQ.
   */
  async createCampaign(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required.',
          code: 'UNAUTHORIZED',
        },
      });
      return;
    }

    const parseResult = createCampaignSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({
        error: {
          message: 'Invalid campaign request payload.',
          code: 'BAD_REQUEST',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
      });
      return;
    }

    try {
      const result = await campaignService.createCampaign(req.user.id, parseResult.data);

      res.status(201).json({
        campaign: {
          id: result.campaign.id,
          subject: result.campaign.subject,
          body: result.campaign.body,
          startAt: result.campaign.startAt.toISOString(),
          delayBetweenEmailsMs: result.campaign.delayBetweenEmailsMs,
          hourlyLimit: result.campaign.hourlyLimit,
          totalCount: result.campaign.totalCount,
          scheduledCount: result.campaign.scheduledCount,
          sentCount: result.campaign.sentCount,
          failedCount: result.campaign.failedCount,
          status: result.campaign.status,
          createdAt: result.campaign.createdAt.toISOString(),
        },
        scheduling: result.scheduling,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create campaign.';
      console.error('[Create Campaign Error]', error);

      res.status(500).json({
        error: {
          message: msg,
          code: 'INTERNAL_SERVER_ERROR',
        },
      });
    }
  }

  /**
   * GET /api/v1/campaigns
   * Retrieves a paginated list of campaigns for the authenticated user.
   */
  async getCampaigns(req: Request, res: Response): Promise<void> {
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
      const { campaigns, pagination } = await campaignService.getCampaigns(
        req.user.id,
        parseResult.data
      );

      res.status(200).json({
        data: campaigns.map((c) => ({
          id: c.id,
          subject: c.subject,
          startAt: c.startAt.toISOString(),
          delayBetweenEmailsMs: c.delayBetweenEmailsMs,
          hourlyLimit: c.hourlyLimit,
          totalCount: c.totalCount,
          scheduledCount: c.scheduledCount,
          sentCount: c.sentCount,
          failedCount: c.failedCount,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
        })),
        pagination,
      });
    } catch (error) {
      console.error('[Get Campaigns Error]', error);
      res.status(500).json({
        error: {
          message: 'Failed to retrieve campaigns.',
          code: 'INTERNAL_SERVER_ERROR',
        },
      });
    }
  }

  /**
   * GET /api/v1/campaigns/:campaignId
   * Retrieves campaign details with sender and stats, ensuring user ownership.
   */
  async getCampaignById(req: Request, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required.',
          code: 'UNAUTHORIZED',
        },
      });
      return;
    }

    const campaignId = req.params.campaignId as string;

    if (!campaignId) {
      res.status(400).json({
        error: {
          message: 'Campaign ID parameter is required.',
          code: 'BAD_REQUEST',
        },
      });
      return;
    }

    try {
      const campaign = await campaignService.getCampaignById(req.user.id, campaignId);

      if (!campaign) {
        res.status(404).json({
          error: {
            message: 'Campaign not found.',
            code: 'NOT_FOUND',
          },
        });
        return;
      }

      res.status(200).json({
        campaign: {
          id: campaign.id,
          subject: campaign.subject,
          body: campaign.body,
          startAt: campaign.startAt.toISOString(),
          delayBetweenEmailsMs: campaign.delayBetweenEmailsMs,
          hourlyLimit: campaign.hourlyLimit,
          totalCount: campaign.totalCount,
          scheduledCount: campaign.scheduledCount,
          sentCount: campaign.sentCount,
          failedCount: campaign.failedCount,
          status: campaign.status,
          sender: campaign.sender,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('[Get Campaign By ID Error]', error);
      res.status(500).json({
        error: {
          message: 'Failed to retrieve campaign details.',
          code: 'INTERNAL_SERVER_ERROR',
        },
      });
    }
  }
}

export const campaignController = new CampaignController();
