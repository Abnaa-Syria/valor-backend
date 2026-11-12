import type { AdminRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAdmin (dashboard API). */
      admin?: {
        id: string;
        name: string;
        email: string;
        role: AdminRole;
      };
      /** Set by requireUser (mobile API). */
      user?: {
        id: string;
        username: string;
      };
    }
  }
}

export {};
