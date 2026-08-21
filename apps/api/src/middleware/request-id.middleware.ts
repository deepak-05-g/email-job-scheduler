import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingId = req.headers['x-request-id'];

  // Sanitize incoming request ID (alphanumeric and hyphens only, max 64 chars) or generate UUIDv4
  let requestId: string;
  if (typeof incomingId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(incomingId.trim())) {
    requestId = incomingId.trim();
  } else {
    requestId = randomUUID();
  }

  req.id = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  next();
};
