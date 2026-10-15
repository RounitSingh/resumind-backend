import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { AppError } from '../lib/errors.js'
import { MAX_UPLOAD_MB } from '../shared/constants.js'
import type { ErrorResponseDto } from '../types/dto.js'
import { ErrorCode } from '../types/enums.js'

const body = (code: ErrorCode, message: string, details: unknown = null): ErrorResponseDto => ({
  error: { code, message, details },
})

// One JSON error shape for every non-2xx.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details))
    return
  }
  if (err instanceof ZodError) {
    res
      .status(400)
      .json(body(ErrorCode.ValidationError, err.errors[0]?.message ?? 'Invalid input.', err.flatten().fieldErrors))
    return
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE'
    res
      .status(tooLarge ? 413 : 400)
      .json(
        body(
          tooLarge ? ErrorCode.FileTooLarge : ErrorCode.ValidationError,
          tooLarge ? `File is larger than ${MAX_UPLOAD_MB} MB.` : 'Invalid upload.',
        ),
      )
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json(body(ErrorCode.ValidationError, 'Invalid JSON body.'))
    return
  }
  console.error('Unhandled error', err)
  res.status(500).json(body(ErrorCode.Internal, 'Something went wrong. Please try again.'))
}
