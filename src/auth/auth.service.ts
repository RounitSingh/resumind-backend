import { and, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../db/index.js'
import { clients, refreshTokens, users } from '../db/schema.js'
import { AppError, conflict } from '../lib/errors.js'
import type { AuthUserDto, LoginDto, RegisterDto } from '../types/dto.js'
import { ErrorCode, UserRole } from '../types/enums.js'
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js'
import { REFRESH_TTL_MS, hashToken, newRefreshToken, signAccessToken } from './tokens.js'

export interface Session {
  user: AuthUserDto
  accessToken: string
  refreshToken: string
}

const toUserDto = (u: typeof users.$inferSelect): AuthUserDto => ({
  id: u.id,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
})

const invalid = () => new AppError(401, ErrorCode.InvalidCredentials, 'Invalid email or password.')
const badRefresh = () => new AppError(401, ErrorCode.Unauthorized, 'Session expired. Please sign in again.')

async function issueSession(u: typeof users.$inferSelect): Promise<Session> {
  const refreshToken = newRefreshToken()
  await db.insert(refreshTokens).values({
    userId: u.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  })
  const accessToken = await signAccessToken({ userId: u.id, role: u.role })
  return { user: toUserDto(u), accessToken, refreshToken }
}

export async function register(input: RegisterDto): Promise<Session> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const role = adminEmail && adminEmail === input.email ? UserRole.Admin : UserRole.User
  const passwordHash = await hashPassword(input.password)

  const [user] = await db
    .insert(users)
    .values({ email: input.email, passwordHash, role })
    .onConflictDoNothing({ target: users.email })
    .returning()
  if (!user) throw conflict(ErrorCode.EmailTaken, 'An account with this email already exists.')

  // The user id doubles as the owner id on resumes / customizations.
  await db.insert(clients).values({ id: user.id }).onConflictDoNothing()
  return issueSession(user)
}

export async function login(input: LoginDto): Promise<Session> {
  const user = await db.query.users.findFirst({ where: eq(users.email, input.email) })
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok) throw invalid()
  await db
    .insert(clients)
    .values({ id: user.id })
    .onConflictDoUpdate({ target: clients.id, set: { lastSeenAt: new Date() } })
  return issueSession(user)
}

// Rotation: each refresh token works once. Replaying a revoked one revokes all of the user's sessions (theft signal).
export async function refresh(token: string): Promise<Session> {
  const row = await db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, hashToken(token)) })
  if (!row) throw badRefresh()

  if (row.revokedAt) {
    await logoutAll(row.userId)
    throw badRefresh()
  }

  // Atomic claim: only one concurrent request can consume it.
  const [claimed] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
    .returning({ id: refreshTokens.id })
  if (!claimed) throw badRefresh()

  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  if (!user) throw badRefresh()
  return issueSession(user)
}

export async function logout(token: string | undefined): Promise<void> {
  if (!token) return
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, hashToken(token)), isNull(refreshTokens.revokedAt)))
}

export async function logoutAll(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
}

export async function getUser(id: string): Promise<AuthUserDto> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!user) throw new AppError(401, ErrorCode.Unauthorized, 'Account no longer exists.')
  return toUserDto(user)
}

export async function listUsers(): Promise<AuthUserDto[]> {
  const rows = await db.query.users.findMany({ orderBy: (u, { desc }) => [desc(u.createdAt)], limit: 200 })
  return rows.map(toUserDto)
}

export async function setRole(id: string, role: UserRole): Promise<AuthUserDto> {
  const [row] = await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id)).returning()
  if (!row) throw new AppError(404, ErrorCode.NotFound, 'User not found.')
  return toUserDto(row)
}
