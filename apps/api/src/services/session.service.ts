import { prisma, Session, User } from '@email-scheduler/db';
import { env } from '@email-scheduler/config';
import { generateOpaqueToken, hashSessionToken } from '../utils/crypto.js';

export interface CreateSessionResult {
  rawToken: string;
  session: Session;
}

export type ValidatedSession = Session & { user: User };

export class SessionService {
  async createSession(userId: string): Promise<CreateSessionResult> {
    const rawToken = generateOpaqueToken(32);
    const tokenHash = hashSessionToken(rawToken, env.SESSION_SECRET);
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

    const session = await prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { rawToken, session };
  }

  async validateSession(rawToken: string): Promise<ValidatedSession | null> {
    if (!rawToken) return null;

    const tokenHash = hashSessionToken(rawToken, env.SESSION_SECRET);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt <= new Date()) return null;

    return session;
  }

  async revokeSession(rawToken: string): Promise<boolean> {
    if (!rawToken) return true;

    const tokenHash = hashSessionToken(rawToken, env.SESSION_SECRET);

    try {
      await prisma.session.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      return true;
    } catch {
      return true;
    }
  }
}

export const sessionService = new SessionService();
