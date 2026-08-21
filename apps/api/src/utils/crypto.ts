import crypto from 'node:crypto';

export const generateOpaqueToken = (lengthBytes: number = 32): string => {
  return crypto.randomBytes(lengthBytes).toString('hex');
};

export const hashSessionToken = (rawToken: string, secret: string): string => {
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
};
