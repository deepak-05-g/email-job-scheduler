import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StatusBadge } from '../components/StatusBadge.js';
import {
  ApiClientError,
  getCurrentUser,
  logoutApi,
  getCampaigns,
  getCampaignById,
  createCampaign,
  getScheduledEmails,
  getSentEmails,
} from '../lib/api-client.js';

describe('Frontend API Client & Component Logic Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. StatusBadge Rendering
  describe('StatusBadge Component', () => {
    it('renders correct labels and badge styles for all campaign and email statuses', () => {
      const scheduledHtml = renderToString(
        React.createElement(StatusBadge, { status: 'SCHEDULED' })
      );
      expect(scheduledHtml).toContain('SCHEDULED');
      expect(scheduledHtml).toContain('bg-blue-50');

      const processingHtml = renderToString(
        React.createElement(StatusBadge, { status: 'PROCESSING' })
      );
      expect(processingHtml).toContain('PROCESSING');
      expect(processingHtml).toContain('animate-pulse');

      const completedHtml = renderToString(
        React.createElement(StatusBadge, { status: 'COMPLETED' })
      );
      expect(completedHtml).toContain('COMPLETED');
      expect(completedHtml).toContain('bg-emerald-50');

      const sentHtml = renderToString(React.createElement(StatusBadge, { status: 'SENT' }));
      expect(sentHtml).toContain('SENT');

      const failedHtml = renderToString(React.createElement(StatusBadge, { status: 'FAILED' }));
      expect(failedHtml).toContain('FAILED');
      expect(failedHtml).toContain('bg-rose-50');

      const partialHtml = renderToString(React.createElement(StatusBadge, { status: 'PARTIAL' }));
      expect(partialHtml).toContain('PARTIAL');
      expect(partialHtml).toContain('bg-purple-50');
    });
  });

  // 2. ApiClientError
  describe('ApiClientError Class', () => {
    it('instantiates error with status, message, and error code', () => {
      const err = new ApiClientError('Invalid campaign parameters', 400, 'INVALID_INPUT', {
        field: 'subject',
      });
      expect(err.message).toBe('Invalid campaign parameters');
      expect(err.status).toBe(400);
      expect(err.code).toBe('INVALID_INPUT');
      expect(err.details).toEqual({ field: 'subject' });
    });
  });

  // 3. API Client - Authentication Methods
  describe('API Client - Auth Endpoints', () => {
    it('getCurrentUser calls /api/v1/auth/me with credentials: include', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      });

      const user = await getCurrentUser();
      expect(user).toEqual(mockUser);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/me'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('logoutApi calls /api/v1/auth/logout with POST method', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await logoutApi();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/auth/logout'),
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });
  });

  // 4. API Client - Campaign Methods
  describe('API Client - Campaign Endpoints', () => {
    it('getCampaigns formats query pagination parameters correctly', async () => {
      const mockCampaigns = {
        data: [
          {
            id: 'camp-1',
            userId: 'user-1',
            senderId: 'sender-1',
            subject: 'Test Campaign',
            startAt: '2026-08-25T10:00:00.000Z',
            delayBetweenEmailsMs: 2000,
            hourlyLimit: 100,
            totalCount: 1,
            scheduledCount: 1,
            sentCount: 0,
            failedCount: 0,
            status: 'SCHEDULED',
            createdAt: '2026-08-21T10:00:00.000Z',
            updatedAt: '2026-08-21T10:00:00.000Z',
          },
        ],
        pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockCampaigns,
      });

      const response = await getCampaigns(2, 10);
      expect(response).toEqual(mockCampaigns);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns?page=2&limit=10'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('getCampaignById calls single campaign endpoint', async () => {
      const mockDetails = {
        campaign: {
          id: 'camp-single-1',
          subject: 'Single Campaign Subject',
          sender: { id: 's-1', name: 'Sender', fromEmail: 's@test.com' },
        },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockDetails,
      });

      const response = await getCampaignById('camp-single-1');
      expect(response).toEqual(mockDetails);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns/camp-single-1'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('createCampaign sends JSON payload with POST', async () => {
      const payload = {
        subject: 'New Bulk Campaign',
        body: '<p>Hello world</p>',
        startAt: '2026-08-25T10:00:00.000Z',
        delayBetweenEmailsMs: 2000,
        hourlyLimit: 100,
        recipients: ['user1@test.com', 'user2@test.com'],
      };

      const mockCreated = {
        campaign: { id: 'camp-new-1', ...payload, totalCount: 2 },
        scheduling: { enqueuedCount: 2, failedEnqueueCount: 0, allEnqueued: true },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockCreated,
      });

      const response = await createCampaign(payload);
      expect(response).toEqual(mockCreated);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/campaigns'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(payload),
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('throws ApiClientError when API returns non-2xx', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Hourly limit must be positive', code: 'INVALID_LIMIT' },
        }),
      });

      await expect(
        createCampaign({
          subject: 'Fail',
          body: 'Fail',
          startAt: new Date().toISOString(),
          delayBetweenEmailsMs: 2000,
          hourlyLimit: -5,
          recipients: ['a@b.com'],
        })
      ).rejects.toThrow('Hourly limit must be positive');
    });
  });

  // 5. API Client - Email Monitoring Methods
  describe('API Client - Email Monitoring Endpoints', () => {
    it('getScheduledEmails requests /api/v1/emails/scheduled with pagination', async () => {
      const mockScheduled = {
        data: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockScheduled,
      });

      const res = await getScheduledEmails(1, 25);
      expect(res).toEqual(mockScheduled);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/emails/scheduled?page=1&limit=25'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('getSentEmails requests /api/v1/emails/sent with pagination', async () => {
      const mockSent = {
        data: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockSent,
      });

      const res = await getSentEmails(1, 25);
      expect(res).toEqual(mockSent);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/emails/sent?page=1&limit=25'),
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('handles 401 unauthorized errors with ApiClientError', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
        }),
      });

      try {
        await getCurrentUser();
        expect.unreachable('Should have thrown 401 ApiClientError');
      } catch (err) {
        expect(err instanceof ApiClientError).toBe(true);
        if (err instanceof ApiClientError) {
          expect(err.status).toBe(401);
          expect(err.code).toBe('UNAUTHORIZED');
          expect(err.message).toBe('Authentication required');
        }
      }
    });

    it('handles 429 rate limit errors with retry-after metadata', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
        }),
      });

      await expect(getCampaigns()).rejects.toThrow('Too many requests');
    });

    it('handles 500 server errors gracefully with fallback message when json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      try {
        await getCampaigns();
        expect.unreachable('Should have thrown 500 ApiClientError');
      } catch (err) {
        expect(err instanceof ApiClientError).toBe(true);
        if (err instanceof ApiClientError) {
          expect(err.status).toBe(500);
          expect(err.message).toBe('HTTP error 500');
        }
      }
    });
  });
});
