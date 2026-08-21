import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Find root .env file if running from nested workspace app
let currentDir = process.cwd();
while (currentDir && currentDir !== path.parse(currentDir).root) {
  const envPath = path.join(currentDir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  currentDir = path.dirname(currentDir);
}

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().default(3001),
  API_PUBLIC_URL: z.string().default('http://localhost:3001'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z
    .string()
    .default('postgresql://scheduler:scheduler@172.30.109.198:5432/email_scheduler?schema=public'),
  REDIS_URL: z.string().default('redis://172.30.109.198:6379'),

  GOOGLE_CLIENT_ID: z.string().default('your-google-client-id'),
  GOOGLE_CLIENT_SECRET: z.string().default('your-google-client-secret'),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:3001/api/v1/auth/google/callback'),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  SESSION_COOKIE_NAME: z.string().default('email_scheduler_session'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters long')
    .default('your-session-secret-at-least-32-chars-long'),
  SESSION_TTL_SECONDS: z.coerce.number().default(86400),

  // Production SMTP Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).optional(),

  // Ethereal SMTP Fallback for Development & Testing
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().default(587),
  ETHEREAL_USER: z.string().default('hosea32@ethereal.email'),
  ETHEREAL_PASS: z.string().default('WPUNmEzYDeXA5sdcdY'),
  ETHEREAL_SECURE: z.preprocess((val) => val === 'true' || val === true || val === '1', z.boolean()).default(false),
  DEFAULT_FROM_EMAIL: z.string().default('hosea32@ethereal.email'),
  DEFAULT_FROM_NAME: z.string().default('Email Scheduler'),

  WORKER_CONCURRENCY: z.coerce.number().default(5),
  WORKER_STALE_PROCESSING_MS: z.coerce.number().default(300000),
  MIN_SEND_DELAY_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR: z.coerce.number().default(100),

  MAX_RECIPIENTS_PER_CAMPAIGN: z.coerce.number().default(1000),
  MAX_UPLOAD_BYTES: z.coerce.number().default(5242880),

  EMAIL_JOB_ATTEMPTS: z.coerce.number().default(3),
  EMAIL_JOB_BACKOFF_MS: z.coerce.number().default(5000),
  COMPLETED_JOB_RETENTION_COUNT: z.coerce.number().default(1000),
  FAILED_JOB_RETENTION_COUNT: z.coerce.number().default(5000),
  PROCESSING_LEASE_MS: z.coerce.number().default(60000),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const validateEnv = (customEnv?: Record<string, string | undefined>): EnvConfig => {
  const parsed = envSchema.safeParse(customEnv || process.env);

  if (!parsed.success) {
    const formattedErrors = parsed.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error(`❌ Invalid environment configuration:\n${formattedErrors}`);
    throw new Error(`Environment validation failed:\n${formattedErrors}`);
  }

  // Harmonize GOOGLE_REDIRECT_URI and GOOGLE_CALLBACK_URL
  const data = parsed.data;
  if (
    data.GOOGLE_REDIRECT_URI &&
    !customEnv?.GOOGLE_CALLBACK_URL &&
    process.env.GOOGLE_REDIRECT_URI
  ) {
    data.GOOGLE_CALLBACK_URL = data.GOOGLE_REDIRECT_URI;
  }

  return data;
};

export const env = validateEnv();
export const CONFIG_PACKAGE_NAME = '@email-scheduler/config';
