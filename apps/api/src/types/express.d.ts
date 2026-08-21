import { User, Session } from '@email-scheduler/db';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
      user?: User;
      session?: Session;
    }
  }
}
export {};
