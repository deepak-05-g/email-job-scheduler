import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from '@email-scheduler/config';
import { HealthResponse, ReadyResponse } from '@email-scheduler/shared';
import { prisma } from '@email-scheduler/db';
import { checkRedisHealth } from '@email-scheduler/queue';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { apiGeneralRateLimiter, authRateLimiter } from './middleware/rate-limiter.middleware.js';
import authRoutes from './routes/auth.routes.js';
import campaignRoutes from './routes/campaign.routes.js';
import emailRoutes from './routes/email.routes.js';

export const createApp = (): Express => {
  const app = express();

  // 1. Correlation Request ID & Baseline Security Headers
  app.use(requestIdMiddleware);

  // 2. Helmet Security Headers (CSP, HSTS, noSniff, frameguard)
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 3. CORS Configuration
  const allowedOrigins = [
    ...env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    env.WEB_PUBLIC_URL.trim(),
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          origin.endsWith('.vercel.app') ||
          origin.includes('localhost') ||
          env.NODE_ENV !== 'production'
        ) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    })
  );

  // 4. Request Body Parsers with Safe Size Limits (1MB limit prevents memory exhaustion attacks)
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 5. Health & Readiness Endpoints
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      service: 'Email Job Scheduler API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health', (_req: Request, res: Response<HealthResponse>) => {
    res.status(200).json({
      status: 'ok',
    });
  });

  app.get('/ready', async (_req: Request, res: Response<ReadyResponse>) => {
    let dbStatus: 'ok' | 'error' = 'error';
    let redisStatus: 'ok' | 'error' = 'error';

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'ok';
    } catch {
      dbStatus = 'error';
    }

    try {
      const redisHealthy = await checkRedisHealth();
      redisStatus = redisHealthy ? 'ok' : 'error';
    } catch {
      redisStatus = 'error';
    }

    const isReady = dbStatus === 'ok' && redisStatus === 'ok';

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        database: dbStatus,
        redis: redisStatus,
      });
    } else {
      res.status(503).json({
        status: 'error',
        database: dbStatus,
        redis: redisStatus,
        message: 'One or more core services are unavailable.',
      });
    }
  });

  // 6. Global API Rate Limiter
  app.use('/api/v1', apiGeneralRateLimiter);

  // 7. Versioned API Routes with Specific Limiters
  app.use('/api/v1/auth', authRateLimiter, authRoutes);
  app.use('/api/v1/campaigns', campaignRoutes);
  app.use('/api/v1/emails', emailRoutes);

  // 8. 404 Catch-All Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        message: `Endpoint ${req.method} ${req.path} not found.`,
        code: 'NOT_FOUND',
      },
    });
  });

  // 9. Centralized Error Middleware (Must be last)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    errorMiddleware(err, req, res, next);
  });

  return app;
};
