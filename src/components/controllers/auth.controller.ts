import type { RequestHandler, Response } from 'express'
import { z } from 'zod'
import * as auth from '../../auth/auth.service.js'
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../../auth/cookies.js'
import { AppError, notFound } from '../../lib/errors.js'
import { loginSchema, registerSchema } from '../../types/dto.js'
import { ErrorCode, UserRole } from '../../types/enums.js'

// The refresh token travels only in an httpOnly cookie; the body carries the short-lived access token.
const send = (res: Response, s: auth.Session, status = 200) => {
  setRefreshCookie(res, s.refreshToken)
  res.status(status).json({ user: s.user, accessToken: s.accessToken })
}

export const register: RequestHandler = async (req, res) => {
  send(res, await auth.register(registerSchema.parse(req.body)), 201)
}

export const login: RequestHandler = async (req, res) => {
  send(res, await auth.login(loginSchema.parse(req.body)))
}

export const refresh: RequestHandler = async (req, res) => {
  const token = readRefreshCookie(req)
  try {
    if (!token) throw new AppError(401, ErrorCode.Unauthorized, 'No session.')
    send(res, await auth.refresh(token))
  } catch (err) {
    clearRefreshCookie(res)
    throw err
  }
}

export const logout: RequestHandler = async (req, res) => {
  await auth.logout(readRefreshCookie(req))
  clearRefreshCookie(res)
  res.status(204).end()
}

export const logoutAll: RequestHandler = async (req, res) => {
  await auth.logoutAll(req.user!.userId)
  clearRefreshCookie(res)
  res.status(204).end()
}

export const me: RequestHandler = async (req, res) => {
  res.json(await auth.getUser(req.user!.userId))
}

export const listUsers: RequestHandler = async (_req, res) => {
  res.json(await auth.listUsers())
}

const roleBody = z.object({ role: z.nativeEnum(UserRole) })

export const updateRole: RequestHandler<{ id: string }> = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id)
  if (!id.success) throw notFound('User')
  res.json(await auth.setRole(id.data, roleBody.parse(req.body).role))
}
