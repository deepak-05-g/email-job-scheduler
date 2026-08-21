import { prisma, User } from '@email-scheduler/db';

export interface GoogleUserProfile {
  googleSubjectId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export class UserService {
  async upsertGoogleUser(profile: GoogleUserProfile): Promise<User> {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ googleSubjectId: profile.googleSubjectId }, { email: profile.email }],
      },
    });

    if (existingUser) {
      return prisma.user.update({
        where: { id: existingUser.id },
        data: {
          googleSubjectId: profile.googleSubjectId,
          email: profile.email,
          name: profile.name ?? existingUser.name,
          avatarUrl: profile.avatarUrl ?? existingUser.avatarUrl,
        },
      });
    }

    return prisma.user.create({
      data: {
        googleSubjectId: profile.googleSubjectId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }
}

export const userService = new UserService();
