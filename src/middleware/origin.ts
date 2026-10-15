import type { RequestHandler } from 'express'
import { forbidden } from '../lib/errors.js'

// CSRF defence in depth: browsers always send Origin on cross-site unsafe requests,
// so reject any state-changing request from an origin that is not on the allow-list.
export const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')
export const checkOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.header('origin')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin && !allowedOrigins.includes(origin)) {
    throw forbidden('Origin not allowed.')
  }
  next()
}
