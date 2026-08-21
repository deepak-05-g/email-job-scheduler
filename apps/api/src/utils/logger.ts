import { env } from '@email-scheduler/config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  requestId?: string;
  userId?: string;
  campaignId?: string;
  emailId?: string;
  path?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

const REDACT_KEYS = [
  'password',
  'secret',
  'token',
  'authorization',
  'cookie',
  'key',
  'code',
  'credential',
];

export const redactSensitiveData = (data: unknown): unknown => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = REDACT_KEYS.some((k) => key.toLowerCase().includes(k));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

class StructuredLogger {
  private service = 'api';

  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    if (env.NODE_ENV === 'test') {
      return; // Keep test output clean
    }

    const sanitizedContext = redactSensitiveData(context) as LogContext;
    const entry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      service: this.service,
      message,
      ...sanitizedContext,
    };

    if (env.NODE_ENV === 'production') {
      console[level === 'debug' ? 'log' : level](JSON.stringify(entry));
    } else {
      const timeStr = entry.timestamp.split('T')[1]?.slice(0, 8);
      const reqStr = context.requestId ? ` [req:${context.requestId.slice(0, 8)}]` : '';
      console[level === 'debug' ? 'log' : level](
        `[${timeStr}] [${this.service}] [${entry.level}]${reqStr} ${message}`,
        Object.keys(sanitizedContext).length > 0 ? sanitizedContext : ''
      );
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
}

export const logger = new StructuredLogger();
