import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { campaignCreateRateLimiter } from '../middleware/rate-limiter.middleware.js';
import { campaignController } from '../controllers/campaign.controller.js';

const router = Router();

// All campaign routes require authentication
router.post('/', authenticateUser, campaignCreateRateLimiter, (req, res) =>
  campaignController.createCampaign(req, res)
);

router.get('/', authenticateUser, (req, res) => campaignController.getCampaigns(req, res));

router.get('/:campaignId', authenticateUser, (req, res) =>
  campaignController.getCampaignById(req, res)
);

export default router;
