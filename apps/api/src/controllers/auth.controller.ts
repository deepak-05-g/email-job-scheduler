import { Request, Response } from 'express';
import { env } from '@email-scheduler/config';
import { UserDto, AuthResponse, ApiErrorResponse } from '@email-scheduler/shared';
import { googleOAuthService } from '../services/google-oauth.service.js';
import { userService } from '../services/user.service.js';
import { sessionService } from '../services/session.service.js';

export class AuthController {
  async initiateGoogleAuth(_req: Request, res: Response): Promise<void> {
    try {
      const state = await googleOAuthService.generateOAuthState();
      const authUrl = googleOAuthService.getGoogleAuthUrl(state);
      res.redirect(302, authUrl);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to initiate Google OAuth';
      console.error(`[Auth Error] ${msg}`);
      res.redirect(`${env.WEB_PUBLIC_URL}/login?error=oauth_init_failed`);
    }
  }

  async handleGoogleCallback(req: Request, res: Response): Promise<void> {
    const { code, state, error } = req.query;

    if (error || !code || typeof code !== 'string' || typeof state !== 'string') {
      res.redirect(`${env.WEB_PUBLIC_URL}/login?error=oauth_failed`);
      return;
    }

    try {
      const isValidState = await googleOAuthService.validateAndConsumeOAuthState(state);
      if (!isValidState) {
        res.redirect(`${env.WEB_PUBLIC_URL}/login?error=invalid_state`);
        return;
      }

      const googleProfile = await googleOAuthService.exchangeCodeForUserInfo(code);
      const user = await userService.upsertGoogleUser(googleProfile);
      const { rawToken } = await sessionService.createSession(user.id);

      res.cookie(env.SESSION_COOKIE_NAME, rawToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: env.SESSION_TTL_SECONDS * 1000,
      });

      res.redirect(`${env.WEB_PUBLIC_URL}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google authentication failed';
      console.error(`[Auth Callback Error] ${msg}`);
      res.redirect(`${env.WEB_PUBLIC_URL}/login?error=auth_failed`);
    }
  }

  async getCurrentUser(req: Request, res: Response<UserDto | ApiErrorResponse>): Promise<void> {
    if (!req.user) {
      res.status(401).json({
        error: {
          message: 'Authentication required',
          code: 'UNAUTHORIZED',
        },
      });
      return;
    }

    res.status(200).json({
      id: req.user.id,
      email: req.user.email,
      name: req.user.name || null,
      avatarUrl: req.user.avatarUrl || null,
    });
  }

  async logout(req: Request, res: Response<AuthResponse>): Promise<void> {
    const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME];

    if (rawToken) {
      await sessionService.revokeSession(rawToken);
    }

    res.clearCookie(env.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    res.status(200).json({
      user: { id: '', email: '' },
      message: 'Logged out successfully',
    });
  }
}

export const authController = new AuthController();
