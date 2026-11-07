export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details);
export const unprocessable = (message, details) => new AppError(422, 'UNPROCESSABLE', message, details);

/** Wraps an async route handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
