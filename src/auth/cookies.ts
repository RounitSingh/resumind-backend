import type { CookieOptions, Request, Response } from 'express'
import { REFRESH_TTL_MS } from './tokens.js'

const NAME = 'refresh_token'
const isProd = process.env.NODE_ENV === 'production'

const sameSite = (): 'lax' | 'strict' | 'none' => {
  const v = process.env.COOKIE_SAMESITE?.toLowerCase()
  if (v === 'lax' || v === 'strict' || v === 'none') return v
  return isProd ? 'none' : 'lax'
}

// Scoped to /api/auth so the refresh token is never sent with ordinary API calls.
const options = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd || sameSite() === 'none',
  sameSite: sameSite(),
  path: '/api/auth',
})

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(NAME, token, { ...options(), maxAge: REFRESH_TTL_MS })
}

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(NAME, options())
}

export const readRefreshCookie = (req: Request): string | undefined => {
  const raw = req.header('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (part.slice(0, i).trim() === NAME) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}
