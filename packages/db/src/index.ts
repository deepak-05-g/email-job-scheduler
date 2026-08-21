import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

let currentDir = process.cwd();
while (currentDir && currentDir !== path.parse(currentDir).root) {
  const envPath = path.join(currentDir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  currentDir = path.dirname(currentDir);
}

declare global {
  var __prismaClient__: PrismaClient | undefined;
  var __pgPool__: pg.Pool | undefined;
}

export const getPgPool = (): pg.Pool => {
  if (!globalThis.__pgPool__) {
    const rawDbUrl =
      process.env.DATABASE_URL || 'postgresql://scheduler:scheduler@127.0.0.1:5433/email_scheduler';
    
    const isSsl =
      rawDbUrl.includes('sslmode=require') ||
      rawDbUrl.includes('neon.tech') ||
      rawDbUrl.includes('render.com') ||
      rawDbUrl.includes('amazonaws.com') ||
      process.env.NODE_ENV === 'production';

    globalThis.__pgPool__ = new pg.Pool({
      connectionString: rawDbUrl,
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      keepAlive: true,
      max: 10,
    });
  }
  return globalThis.__pgPool__;
};

export const getPrisma = (): PrismaClient => {
  if (!globalThis.__prismaClient__) {
    const pool = getPgPool();
    const adapter = new PrismaPg(pool);
    globalThis.__prismaClient__ = new PrismaClient({ adapter });
  }
  return globalThis.__prismaClient__;
};

export const prisma: PrismaClient = getPrisma();

export * from '@prisma/client';
