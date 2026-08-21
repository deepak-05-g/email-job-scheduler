import { describe, it, expect, afterAll } from 'vitest';
import { prisma, getPgPool } from '../index.js';

describe('Database Client', () => {
  afterAll(async () => {
    await prisma.$disconnect();
    await getPgPool().end();
  });

  it('should initialize Prisma Client singleton', () => {
    expect(prisma).toBeDefined();
  });

  it('should connect to PostgreSQL database successfully', async () => {
    const result = await prisma.$queryRaw<{ result: number }[]>`SELECT 1 as result`;
    expect(result).toBeDefined();
    expect(result[0].result).toBe(1);
  });
});
