export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const rlsError = (table) =>
  new ApiError(403, `new row violates row-level security policy for table "${table}"`, { rls: true });

export const noRowsError = (table) =>
  new ApiError(403, `0 rows updated: no policy on "${table}" lets you modify this row`, { rls: true });

export const constraintError = (message) => new ApiError(400, message, { constraint: true });
