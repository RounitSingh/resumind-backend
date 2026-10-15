import { ErrorCode } from '../types/enums.js'

// The only errors whose message reaches the user.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message)
  }
}

export const badRequest = (code: ErrorCode, message: string, details?: unknown) =>
  new AppError(400, code, message, details)
export const notFound = (what = 'Resource') => new AppError(404, ErrorCode.NotFound, `${what} not found.`)
export const notReady = () => new AppError(409, ErrorCode.NotReady, 'This version is not finished yet.')
export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(403, ErrorCode.Forbidden, message)
export const conflict = (code: ErrorCode, message: string) => new AppError(409, code, message)
