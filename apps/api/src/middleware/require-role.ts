/**
 * Role-gating middleware — PRD §7.2 (T5.6)
 * Viewers can read but not mutate. Editors and admins can mutate.
 */

import type { Request, Response, NextFunction } from 'express';
import { ApiError } from './error-handler';
import { API_ERROR_CODES } from '@clipforge/shared';

export function requireRole(...allowed: Array<'admin' | 'editor'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, API_ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
    }
    if (req.user.role === 'viewer') {
      return next(
        new ApiError(
          403,
          API_ERROR_CODES.FORBIDDEN,
          'Viewers have read-only access. Ask an admin to upgrade your role.'
        )
      );
    }
    if (!allowed.includes(req.user.role) && !req.user.isAdmin) {
      return next(new ApiError(403, API_ERROR_CODES.FORBIDDEN, 'Insufficient role'));
    }
    next();
  };
}