import { Router } from 'express';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { emailController } from '../controllers/email.controller.js';

const router = Router();

// All email routes require authentication
router.get('/scheduled', authenticateUser, (req, res) =>
  emailController.getScheduledEmails(req, res)
);

router.get('/sent', authenticateUser, (req, res) => emailController.getSentEmails(req, res));

export default router;
