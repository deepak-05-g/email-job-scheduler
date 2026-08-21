import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/google', (req, res) => authController.initiateGoogleAuth(req, res));
router.get('/google/callback', (req, res) => authController.handleGoogleCallback(req, res));
router.get('/me', authenticateUser, (req, res) => authController.getCurrentUser(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

export default router;
