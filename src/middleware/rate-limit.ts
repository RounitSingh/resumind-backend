import rateLimit from 'express-rate-limit'
import type { ErrorResponseDto } from '../types/dto.js'
import { ErrorCode } from '../types/enums.js'

// Protects the Gemini quota on LLM endpoints.
export const llmLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ErrorResponseDto = {
      error: { code: ErrorCode.RateLimited, message: 'Too many requests. Try again in a few minutes.', details: null },
    }
    res.status(429).json(body)
  },
})

// Brute-force protection on register / login.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ErrorResponseDto = {
      error: { code: ErrorCode.RateLimited, message: 'Too many attempts. Try again later.', details: null },
    }
    res.status(429).json(body)
  },
})
