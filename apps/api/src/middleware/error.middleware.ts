import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '@email-scheduler/config';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 500, code = 'INTERNAL_SERVER_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // 1. Zod Validation Error
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      error: {
        message: 'Invalid request payload or query parameters.',
        code: 'VALIDATION_ERROR',
        details,
      },
    });
    return;
  }

  // 2. Custom Application Error
  if (err instanceof AppError) {
    logger.warn(`AppError [${err.code}] - ${err.message}`, {
      requestId: req.id,
      status: err.status,
      code: err.code,
      path: req.path,
    });

    res.status(err.status).json({
      error: {
        message: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 3. Prisma Known Request Errors
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const prismaErr = err as { code: string; message: string };

    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        error: {
          message: 'A resource with these unique properties already exists.',
          code: 'RESOURCE_CONFLICT',
        },
      });
      return;
    }

    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        error: {
          message: 'Requested resource not found.',
          code: 'NOT_FOUND',
        },
      });
      return;
    }
  }

  // 4. General / Unhandled Error
  const rawMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
  const isProd = env.NODE_ENV === 'production';

  logger.error('Unhandled API Server Error', {
    requestId: req.id,
    path: req.path,
    method: req.method,
    error: rawMessage,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      message: isProd ? 'An internal server error occurred.' : rawMessage,
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
};
