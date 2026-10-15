import type { AccessClaims } from '../auth/tokens.js'

declare global {
  namespace Express {
    interface Request {
      clientId: string // owner id for data queries (= authenticated user id)
      user?: AccessClaims
    }
  }
}

export {}
