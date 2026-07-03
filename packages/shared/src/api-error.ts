/**
 * Cross-workspace API error class — shared by API and worker.
 */

import { API_ERROR_CODES, type ApiErrorCode } from './index';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

void API_ERROR_CODES;