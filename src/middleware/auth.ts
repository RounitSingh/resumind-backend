import type { RequestHandler } from 'express'
import { verifyAccessToken } from '../auth/tokens.js'
import { AppError, forbidden } from '../lib/errors.js'
import { ErrorCode, UserRole } from '../types/enums.js'

// Authentication: valid `Authorization: Bearer <jwt>`. Sets req.user and req.clientId
// (= user id), so every existing ownership-filtered query keeps working unchanged.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const match = req.header('authorization')?.match(/^Bearer (.+)$/i)
  if (!match) throw new AppError(401, ErrorCode.Unauthorized, 'Authentication required.')
  const claims = await verifyAccessToken(match[1]!)
  req.user = claims
  req.clientId = claims.userId
  next()
}

// Authorization: role check. Use after requireAuth.
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden('Insufficient role.')
    next()
  }
