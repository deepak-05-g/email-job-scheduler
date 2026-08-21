import { Request, Response, NextFunction } from 'express';
import { getSharedRedisConnection } from '@email-scheduler/queue';
import { env } from '@email-scheduler/config';
import { logger } from '../utils/logger.js';

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  prefix: string;
  keyGenerator?: (req: Request) => string;
}

const RATE_LIMIT_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

export const createRedisRateLimiter = (options: RateLimitOptions) => {
  const { windowSeconds, maxRequests, prefix, keyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Disable rate limiting in test environment for fast test execution
    if (env.NODE_ENV === 'test') {
      return next();
    }

    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown-ip';

      const keyIdentifier = keyGenerator ? keyGenerator(req) : clientIp;
      const redisKey = `ratelimit:${prefix}:${keyIdentifier}`;

      const redis = getSharedRedisConnection();
      const result = (await redis.eval(RATE_LIMIT_LUA_SCRIPT, 1, redisKey, windowSeconds)) as [
        number,
        number,
      ];

      const currentCount = result[0];
      const remainingTtl = result[1];

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));
      res.setHeader('X-RateLimit-Reset', remainingTtl);

      if (currentCount > maxRequests) {
        logger.warn('Rate limit exceeded', {
          requestId: req.id,
          prefix,
          identifier: keyIdentifier,
          currentCount,
          maxRequests,
        });

        res.setHeader('Retry-After', remainingTtl);
        res.status(429).json({
          error: {
            message: 'Too many requests. Please slow down and try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Fail-open strategy with warning: don't crash HTTP requests if rate limit Redis check fails
      logger.warn('Rate limiter error, allowing request (fail-open)', {
        requestId: req.id,
        error: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  };
};

// Target rate limiters
export const authRateLimiter = createRedisRateLimiter({
  prefix: 'auth',
  windowSeconds: 60,
  maxRequests: 30,
});

export const campaignCreateRateLimiter = createRedisRateLimiter({
  prefix: 'campaign-create',
  windowSeconds: 60,
  maxRequests: 20,
  keyGenerator: (req) => req.user?.id || req.ip || 'anon',
});

export const apiGeneralRateLimiter = createRedisRateLimiter({
  prefix: 'api-general',
  windowSeconds: 60,
  maxRequests: 300,
});
