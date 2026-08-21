import { getSharedRedisConnection } from '@email-scheduler/queue';

export interface RateLimitResult {
  allowed: boolean;
  reason?: 'HOURLY_LIMIT_EXCEEDED' | 'MIN_DELAY_NOT_MET';
  retryAfterMs?: number;
}

export class RateLimitService {
  /**
   * Evaluates both hourly limit and minimum send delay atomically in Redis.
   * Returns whether the send can proceed or if it needs to be delayed/rescheduled.
   */
  async acquireSendPermission(
    senderId: string,
    hourlyLimit: number,
    delayBetweenEmailsMs: number
  ): Promise<RateLimitResult> {
    const redis = getSharedRedisConnection();
    const now = Date.now();

    // 1. Check & Reserve Hourly Rate Limit
    const nowObj = new Date(now);
    const hourWindow = new Date(
      nowObj.getFullYear(),
      nowObj.getMonth(),
      nowObj.getDate(),
      nowObj.getHours()
    ).getTime();
    const nextHourWindow = hourWindow + 3600000;

    const hourlyKey = `email-rate:hourly:${senderId}:${hourWindow}`;

    // Lua script to atomically increment and check hourly limit
    const hourlyLua = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
      end
      if current > tonumber(ARGV[1]) then
        redis.call('DECR', KEYS[1])
        return 0
      end
      return 1
    `;

    const hourlyAllowed = await redis.eval(
      hourlyLua,
      1,
      hourlyKey,
      hourlyLimit.toString(),
      '7200' // TTL 2 hours
    );

    if (hourlyAllowed !== 1) {
      const retryAfterMs = Math.max(1000, nextHourWindow - now + 1000);
      return {
        allowed: false,
        reason: 'HOURLY_LIMIT_EXCEEDED',
        retryAfterMs,
      };
    }

    // 2. Check & Reserve Minimum Delay Between Sends
    const minDelayKey = `email-rate:last-send:${senderId}`;

    const minDelayLua = `
      local last = redis.call('GET', KEYS[1])
      if last then
        local nextAllowed = tonumber(last) + tonumber(ARGV[2])
        if tonumber(ARGV[1]) < nextAllowed then
          return nextAllowed - tonumber(ARGV[1])
        end
      end
      redis.call('SET', KEYS[1], ARGV[1], 'PX', tonumber(ARGV[2]) * 2 + 60000)
      return 0
    `;

    const waitMs = (await redis.eval(
      minDelayLua,
      1,
      minDelayKey,
      now.toString(),
      delayBetweenEmailsMs.toString()
    )) as number;

    if (waitMs > 0) {
      // Revert hourly increment since we couldn't send in this exact slot
      await redis.decr(hourlyKey);
      return {
        allowed: false,
        reason: 'MIN_DELAY_NOT_MET',
        retryAfterMs: waitMs,
      };
    }

    return { allowed: true };
  }

  /**
   * Resets rate limit counters for testing purposes.
   */
  async resetSenderLimits(senderId: string): Promise<void> {
    const redis = getSharedRedisConnection();
    const keys = await redis.keys(`email-rate:*:${senderId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.del(`email-rate:last-send:${senderId}`);
  }
}

export const rateLimitService = new RateLimitService();
