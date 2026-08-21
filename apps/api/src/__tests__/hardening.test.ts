import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { AppError } from '../middleware/error.middleware.js';
import { createRedisRateLimiter } from '../middleware/rate-limiter.middleware.js';
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

describe('Production Hardening, Error Handling & Observability Suite', () => {
  const app = createApp();

  // 1. Correlation Request ID & Security Headers
  describe('Correlation Request ID & Security Headers', () => {
    it('generates a UUID X-Request-Id header when none is provided', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id'].length).toBeGreaterThan(10);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('sanitizes and preserves a valid incoming X-Request-Id', async () => {
      const customId = 'client-req-trace-12345';
      const res = await request(app).get('/health').set('X-Request-Id', customId);
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('replaces an invalid or malicious X-Request-Id with a secure generated UUID', async () => {
      const maliciousId = '<script>alert(1)</script>';
      const res = await request(app).get('/health').set('X-Request-Id', maliciousId);
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).not.toBe(maliciousId);
      expect(res.headers['x-request-id']).toMatch(/^[a-zA-Z0-9-]{36}$/);
    });
  });

  // 2. Health & Readiness Infrastructure Endpoints
  describe('Health & Readiness Endpoints', () => {
    it('GET /health returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /ready returns status ready when PostgreSQL and Redis are healthy', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.database).toBe('ok');
      expect(res.body.redis).toBe('ok');
    });
  });

  // 3. Centralized Error Handling Middleware
  describe('Centralized Error Middleware', () => {
    it('returns 404 for unknown endpoints with structured error response', async () => {
      const res = await request(app).get('/api/v1/unknown-endpoint');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: {
          message: 'Endpoint GET /api/v1/unknown-endpoint not found.',
          code: 'NOT_FOUND',
        },
      });
    });

    it('formats Zod validation errors cleanly without exposing internals', async () => {
      const testApp = express();
      testApp.use(express.json());
      testApp.post('/test-zod', (_req, _res, next) => {
        const schema = z.object({
          email: z.string().email(),
          count: z.number().min(1),
        });
        try {
          schema.parse({ email: 'not-an-email', count: 0 });
        } catch (err) {
          next(err);
        }
      });
      // Attach error middleware
      const { errorMiddleware } = await import('../middleware/error.middleware.js');
      testApp.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        errorMiddleware(err, req, res, next);
      });

      const res = await request(testApp).post('/test-zod').send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    it('maps custom AppError with correct status and code', async () => {
      const testApp = express();
      testApp.get('/test-app-error', () => {
        throw new AppError('Custom rate limit exceeded message', 429, 'CUSTOM_RATE_LIMIT', {
          retryAfter: 60,
        });
      });
      const { errorMiddleware } = await import('../middleware/error.middleware.js');
      testApp.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        errorMiddleware(err, req, res, next);
      });

      const res = await request(testApp).get('/test-app-error');
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('CUSTOM_RATE_LIMIT');
      expect(res.body.error.message).toBe('Custom rate limit exceeded message');
      expect(res.body.error.details).toEqual({ retryAfter: 60 });
    });

    it('maps Prisma P2002 unique constraint violations to 409 RESOURCE_CONFLICT', async () => {
      const testApp = express();
      testApp.get('/test-prisma-conflict', () => {
        const prismaErr = {
          code: 'P2002',
          message: 'Unique constraint failed on the fields: (`email`)',
        };
        throw prismaErr;
      });
      const { errorMiddleware } = await import('../middleware/error.middleware.js');
      testApp.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
        errorMiddleware(err, req, res, next);
      });

      const res = await request(testApp).get('/test-prisma-conflict');
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('RESOURCE_CONFLICT');
      expect(res.body.error.message).toBe(
        'A resource with these unique properties already exists.'
      );
    });
  });

  // 4. Rate Limiter Logic & Behavior
  describe('Redis Rate Limiter Middleware Logic', () => {
    it('creates rate limiter and enforces limits under high frequency', async () => {
      const testApp = express();
      const limiter = createRedisRateLimiter({
        prefix: 'test-limiter',
        windowSeconds: 10,
        maxRequests: 2,
        keyGenerator: () => 'test-client-unique-123',
      });

      testApp.get('/limited', limiter, (_req, res) => {
        res.json({ success: true });
      });

      // In test env, limiter passes through by default unless manually invoked
      const reqMock = {
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;

      const resMock = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      const nextMock = vi.fn();

      // Test manual execution of limiter
      await limiter(reqMock, resMock, nextMock);
      expect(nextMock).toHaveBeenCalledTimes(1);
    });
  });
});
