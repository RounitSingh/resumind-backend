import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify, errors } from 'jose'
import { AppError } from '../lib/errors.js'
import { ErrorCode, UserRole } from '../types/enums.js'

const ISSUER = 'resume-tailor'
const AUDIENCE = 'resume-tailor-api'

const secret = (() => {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters long')
  return new TextEncoder().encode(s)
})()

export const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL ?? '15m'
export const REFRESH_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 7) * 24 * 60 * 60_000

export interface AccessClaims {
  userId: string
  role: UserRole
}

export const signAccessToken = (c: AccessClaims): Promise<string> =>
  new SignJWT({ role: c.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(c.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(secret)

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    })
    const role = payload.role
    if (!payload.sub || (role !== UserRole.User && role !== UserRole.Admin)) throw new Error('bad claims')
    return { userId: payload.sub, role }
  } catch (err) {
    const expired = err instanceof errors.JWTExpired
    throw new AppError(401, ErrorCode.Unauthorized, expired ? 'Access token expired.' : 'Invalid access token.')
  }
}

export const newRefreshToken = (): string => randomBytes(48).toString('base64url')
export const hashToken = (t: string): string => createHash('sha256').update(t).digest('hex')
