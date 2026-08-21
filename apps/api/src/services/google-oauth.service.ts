import { prisma } from '@email-scheduler/db';
import { env } from '@email-scheduler/config';
import { generateOpaqueToken } from '../utils/crypto.js';
import { GoogleUserProfile } from './user.service.js';

export class GoogleOAuthService {
  async generateOAuthState(): Promise<string> {
    const state = generateOpaqueToken(24);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oAuthState.create({
      data: {
        state,
        expiresAt,
      },
    });

    return state;
  }

  async validateAndConsumeOAuthState(state: string): Promise<boolean> {
    if (!state) return false;

    const record = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!record) return false;

    // Delete record immediately to ensure single-use
    await prisma.oAuthState.delete({
      where: { id: record.id },
    });

    if (record.expiresAt <= new Date()) {
      return false;
    }

    return true;
  }

  getGoogleAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCodeForUserInfo(code: string): Promise<GoogleUserProfile> {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Google token exchange failed: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };

    const userInfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      throw new Error(`Google userinfo request failed: ${userInfoResponse.status} ${errorText}`);
    }

    const profileData = (await userInfoResponse.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    if (!profileData.sub || !profileData.email) {
      throw new Error('Google userinfo response did not include required sub or email fields');
    }

    return {
      googleSubjectId: profileData.sub,
      email: profileData.email,
      name: profileData.name || null,
      avatarUrl: profileData.picture || null,
    };
  }
}

export const googleOAuthService = new GoogleOAuthService();
