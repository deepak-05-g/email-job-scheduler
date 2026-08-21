export const EMAIL_SEND_QUEUE_NAME = 'email-send';

export interface EmailJobPayload {
  emailId: string;
}

export interface EnqueueEmailOptions {
  delayMs?: number;
}
