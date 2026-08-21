import { Request, Response, NextFunction } from 'express';
import { env } from '@email-scheduler/config';
import { ApiErrorResponse } from '@email-scheduler/shared';
import { sessionService } from '../services/session.service.js';

export const authenticateUser = async (
  req: Request,
  res: Response<ApiErrorResponse>,
  next: NextFunction
): Promise<void> => {
  const rawToken = req.cookies?.[env.SESSION_COOKIE_NAME];

  if (!rawToken) {
    res.status(401).json({
      error: {
        message: 'Authentication required. Session cookie missing or invalid.',
        code: 'UNAUTHORIZED',
      },
    });
    return;
  }

  const validatedSession = await sessionService.validateSession(rawToken);

  if (!validatedSession) {
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.status(401).json({
      error: {
        message: 'Invalid, expired, or revoked session.',
        code: 'UNAUTHORIZED',
      },
    });
    return;
  }

  req.user = validatedSession.user;
  req.session = validatedSession;

  next();
};
