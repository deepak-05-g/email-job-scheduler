import {
  UserDto,
  ApiErrorResponse,
  CampaignDto,
  CampaignDetailsResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
  EmailDto,
  PaginatedResponse,
} from '@email-scheduler/shared';

const API_BASE_URL =
  (import.meta.env.VITE_API_PUBLIC_URL as string) ||
  (import.meta.env.VITE_API_URL as string) ||
  'http://localhost:3001';

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const fetchApi = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = (await response.json()) as ApiErrorResponse;
    } catch {
      // Failed to parse JSON error response
    }

    const message = errorData?.error?.message || `HTTP error ${response.status}`;
    const code = errorData?.error?.code;
    const details = errorData?.error?.details;

    throw new ApiClientError(message, response.status, code, details);
  }

  return response.json() as Promise<T>;
};

// Auth APIs
export const getCurrentUser = async (): Promise<UserDto> => {
  return fetchApi<UserDto>('/api/v1/auth/me');
};

export const logoutApi = async (): Promise<void> => {
  await fetchApi('/api/v1/auth/logout', { method: 'POST' });
};

// Campaign APIs
export const getCampaigns = async (
  page = 1,
  limit = 25
): Promise<PaginatedResponse<CampaignDto>> => {
  return fetchApi<PaginatedResponse<CampaignDto>>(`/api/v1/campaigns?page=${page}&limit=${limit}`);
};

export const getCampaignById = async (campaignId: string): Promise<CampaignDetailsResponse> => {
  return fetchApi<CampaignDetailsResponse>(`/api/v1/campaigns/${campaignId}`);
};

export const createCampaign = async (
  input: CreateCampaignRequest
): Promise<CreateCampaignResponse> => {
  return fetchApi<CreateCampaignResponse>('/api/v1/campaigns', {
    method: 'POST',
    body: JSON.stringify(input),
  });
};

// Email Monitoring APIs
export const getScheduledEmails = async (
  page = 1,
  limit = 25
): Promise<PaginatedResponse<EmailDto>> => {
  return fetchApi<PaginatedResponse<EmailDto>>(
    `/api/v1/emails/scheduled?page=${page}&limit=${limit}`
  );
};

export const getSentEmails = async (page = 1, limit = 25): Promise<PaginatedResponse<EmailDto>> => {
  return fetchApi<PaginatedResponse<EmailDto>>(`/api/v1/emails/sent?page=${page}&limit=${limit}`);
};
