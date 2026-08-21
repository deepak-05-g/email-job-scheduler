export interface HealthResponse {
  status: 'ok';
  timestamp?: string;
}

export interface ReadyResponse {
  status: 'ready' | 'error';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  message?: string;
}

export interface UserDto {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  user: UserDto;
  message?: string;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export type CampaignStatus =
  'SCHEDULED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';

export type EmailStatus = 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'RETRY_PENDING' | 'FAILED';

export interface CreateCampaignRequest {
  subject: string;
  body: string;
  startAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  recipients: string[];
}

export interface CampaignDto {
  id: string;
  userId: string;
  senderId: string;
  subject: string;
  body?: string;
  startAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  totalCount: number;
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulingMeta {
  enqueuedCount: number;
  failedEnqueueCount: number;
  allEnqueued: boolean;
}

export interface CreateCampaignResponse {
  campaign: CampaignDto;
  scheduling: SchedulingMeta;
}

export interface EmailDto {
  id: string;
  campaignId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  attemptCount: number;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface SenderDto {
  id: string;
  name: string;
  fromEmail: string;
}

export interface CampaignDetailsDto extends CampaignDto {
  sender: SenderDto;
}

export interface CampaignDetailsResponse {
  campaign: CampaignDetailsDto;
}

export const SHARED_PACKAGE_NAME = '@email-scheduler/shared';
