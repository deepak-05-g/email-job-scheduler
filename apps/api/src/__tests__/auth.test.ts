import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { prisma, User } from '@email-scheduler/db';
import { env } from '@email-scheduler/config';
import { createApp } from '../app.js';
import { generateOpaqueToken, hashSessionToken } from '../utils/crypto.js';
import { sessionService } from '../services/session.service.js';
import { googleOAuthService } from '../services/google-oauth.service.js';

const app = createApp();

describe('Authentication & Session Infrastructure', () => {
  let testUser: User;

  beforeAll(async () => {
    // Create a test user in DB
    testUser = await prisma.user.upsert({
      where: { email: 'test.auth.user@example.com' },
      update: { name: 'Test User' },
      create: {
        googleSubjectId: 'google-sub-test-12345',
        email: 'test.auth.user@example.com',
        name: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      },
    });
  });

  afterAll(async () => {
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
  });

  describe('Crypto & Hashing Utils', () => {
    it('should generate opaque random tokens', () => {
      const token1 = generateOpaqueToken(32);
      const token2 = generateOpaqueToken(32);

      expect(token1).toBeDefined();
      expect(token1.length).toBe(64);
      expect(token1).not.toBe(token2);
    });

    it('should generate deterministic HMAC-SHA256 token hashes', () => {
      const token = 'sample-token-123';
      const secret = 'super-secret-pepper-32-chars-long';

      const hash1 = hashSessionToken(token, secret);
      const hash2 = hashSessionToken(token, secret);
      const hashDiffSecret = hashSessionToken(token, 'another-secret-key-32-chars-long');

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hashDiffSecret);
    });
  });

  describe('OAuth State Protection', () => {
    it('should generate and validate single-use OAuth state', async () => {
      const state = await googleOAuthService.generateOAuthState();
      expect(state).toBeDefined();

      const isValidFirstCall = await googleOAuthService.validateAndConsumeOAuthState(state);
      expect(isValidFirstCall).toBe(true);

      // Single-use check: second attempt must fail
      const isValidSecondCall = await googleOAuthService.validateAndConsumeOAuthState(state);
      expect(isValidSecondCall).toBe(false);
    });
  });

  describe('Session Service', () => {
    it('should create and validate a active session', async () => {
      const { rawToken, session } = await sessionService.createSession(testUser.id);
      expect(rawToken).toBeDefined();
      expect(session.userId).toBe(testUser.id);

      const validated = await sessionService.validateSession(rawToken);
      expect(validated).not.toBeNull();
      expect(validated?.user.id).toBe(testUser.id);
    });

    it('should reject revoked sessions', async () => {
      const { rawToken } = await sessionService.createSession(testUser.id);
      await sessionService.revokeSession(rawToken);

      const validated = await sessionService.validateSession(rawToken);
      expect(validated).toBeNull();
    });

    it('should reject expired sessions', async () => {
      const rawToken = generateOpaqueToken(32);
      const tokenHash = hashSessionToken(rawToken, env.SESSION_SECRET);

      // Manually insert an expired session
      await prisma.session.create({
        data: {
          userId: testUser.id,
          tokenHash,
          expiresAt: new Date(Date.now() - 10000), // expired 10s ago
        },
      });

      const validated = await sessionService.validateSession(rawToken);
      expect(validated).toBeNull();
    });
  });

  describe('Health & Readiness Endpoints', () => {
    it('GET /health should return status ok', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('GET /ready should return database and redis ready status', async () => {
      const response = await request(app).get('/ready');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ready',
        database: 'ok',
        redis: 'ok',
      });
    });
  });

  describe('OAuth Authorization Initialization', () => {
    it('GET /api/v1/auth/google should create OAuthState in PostgreSQL and redirect to Google', async () => {
      const response = await request(app).get('/api/v1/auth/google');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBeDefined();

      const redirectUrl = new URL(response.headers.location);
      expect(redirectUrl.origin).toBe('https://accounts.google.com');
      expect(redirectUrl.pathname).toBe('/o/oauth2/v2/auth');

      const stateParam = redirectUrl.searchParams.get('state');
      expect(stateParam).toBeDefined();

      // Verify OAuthState was persisted to PostgreSQL
      const stateInDb = await prisma.oAuthState.findUnique({
        where: { state: stateParam! },
      });
      expect(stateInDb).toBeDefined();
      expect(stateInDb?.state).toBe(stateParam);
    });
  });

  describe('API Auth Endpoints', () => {
    it('GET /api/v1/auth/me should return HTTP 401 when unauthenticated', async () => {
      const response = await request(app).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/v1/auth/me should return user info when authenticated via cookie', async () => {
      const { rawToken } = await sessionService.createSession(testUser.id);

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${rawToken}`]);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        avatarUrl: testUser.avatarUrl,
      });
      // Ensure no secrets/tokens are leaked
      expect(response.body.tokenHash).toBeUndefined();
      expect(response.body.sessionSecret).toBeUndefined();
    });

    it('POST /api/v1/auth/logout should revoke session and clear cookie', async () => {
      const { rawToken } = await sessionService.createSession(testUser.id);

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${rawToken}`]);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers['set-cookie']).toBeDefined();

      // Verify session was revoked in DB
      const validatedAfterLogout = await sessionService.validateSession(rawToken);
      expect(validatedAfterLogout).toBeNull();

      // Subsequent /api/v1/auth/me request should return 401
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', [`${env.SESSION_COOKIE_NAME}=${rawToken}`]);

      expect(meRes.status).toBe(401);
    });
  });
});
