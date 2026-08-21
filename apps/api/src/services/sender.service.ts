import { prisma, Sender } from '@email-scheduler/db';
import { env } from '@email-scheduler/config';

export class SenderService {
  /**
   * Finds an active sender belonging to the user, or creates a default development sender.
   */
  async getOrCreateDefaultSender(userId: string): Promise<Sender> {
    const existingSender = await prisma.sender.findFirst({
      where: {
        userId,
        active: true,
      },
    });

    if (existingSender) {
      return existingSender;
    }

    return await prisma.sender.create({
      data: {
        userId,
        name: env.DEFAULT_FROM_NAME,
        fromEmail: env.DEFAULT_FROM_EMAIL,
        provider: 'ethereal',
        active: true,
      },
    });
  }
}

export const senderService = new SenderService();
