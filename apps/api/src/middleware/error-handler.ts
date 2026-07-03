/**
 * Centralized error handler.
 * Maps known errors to API error codes from @clipforge/shared.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { API_ERROR_CODES, type ApiErrorCode } from '@clipforge/shared';
import { logger } from '../logger';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const requestId = req.id;

  if (err instanceof ApiError) {
    logger.warn({ requestId, code: err.code, status: err.status, msg: err.message }, 'api error');
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: 'Invalid request payload',
        details: err.flatten(),
      },
    });
  }

  logger.error({ requestId, err: { message: err.message, stack: err.stack } }, 'unhandled error');
  return res.status(500).json({
    error: {
      code: API_ERROR_CODES.INTERNAL,
      message: 'Internal server error',
    },
  });
}