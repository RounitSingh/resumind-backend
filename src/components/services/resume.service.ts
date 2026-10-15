import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { customizations, resumes } from '../../db/schema.js'
import { AppError, conflict, notFound } from '../../lib/errors.js'
import { MAX_RESUMES_PER_USER } from '../../shared/constants.js'
import type { PageDto, PageQuery, ResumeDetailDto, ResumeDto } from '../../types/dto.js'
import { ErrorCode } from '../../types/enums.js'
import { extractResumeText } from './resume.parser.js'

type ResumeRow = typeof resumes.$inferSelect
type Usage = { customizationCount: number; lastUsedAt: Date | null }

const toDto = (row: ResumeRow, usage: Usage = { customizationCount: 0, lastUsedAt: null }): ResumeDto => ({
  id: row.id,
  fileName: row.fileName,
  fileSize: row.fileSize,
  mimeType: row.mimeType,
  charCount: row.rawText.length,
  preview: row.rawText.slice(0, 400),
  createdAt: row.createdAt,
  ...usage,
})

// How many tailored versions each resume has, and when the newest was made.
async function usageFor(clientId: string, ids: string[]): Promise<Map<string, Usage>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({
      resumeId: customizations.resumeId,
      count: sql<number>`count(*)::int`,
      last: sql<Date | null>`max(${customizations.createdAt})`,
    })
    .from(customizations)
    .where(and(eq(customizations.clientId, clientId), inArray(customizations.resumeId, ids)))
    .groupBy(customizations.resumeId)
  return new Map(
    rows.map((r) => [r.resumeId, { customizationCount: r.count, lastUsedAt: r.last ? new Date(r.last) : null }]),
  )
}

// Plain sha256 of raw_text, the same value the 0002 migration backfills.
const hashText = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

// Parse immediately so a bad file fails in seconds, not after an LLM run.
// Uploading the same text again returns the existing row (and its cached structured JSON).
export async function createResume(clientId: string, file: Express.Multer.File | undefined): Promise<ResumeDto> {
  if (!file) throw new AppError(400, ErrorCode.ValidationError, 'Attach a PDF or DOCX in the "file" field.')

  const rawText = await extractResumeText(file.buffer)
  const contentHash = hashText(rawText)

  // Same text again: return the existing row without counting it against the cap.
  const existing = await db.query.resumes.findFirst({
    where: and(eq(resumes.clientId, clientId), eq(resumes.contentHash, contentHash)),
  })
  if (existing) return toDto(existing, (await usageFor(clientId, [existing.id])).get(existing.id))

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(resumes)
    .where(eq(resumes.clientId, clientId))
  if (n >= MAX_RESUMES_PER_USER) {
    throw conflict(
      ErrorCode.LimitReached,
      `You can keep up to ${MAX_RESUMES_PER_USER} resumes. Delete one to upload another.`,
    )
  }

  const [inserted] = await db
    .insert(resumes)
    .values({
      clientId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      contentHash,
      rawText,
    })
    .onConflictDoNothing({ target: [resumes.clientId, resumes.contentHash] })
    .returning()

  const row =
    inserted ??
    (await db.query.resumes.findFirst({
      where: and(eq(resumes.clientId, clientId), eq(resumes.contentHash, contentHash)),
    }))
  if (!row) throw new AppError(500, ErrorCode.Internal, 'Could not save the resume.')
  return toDto(row)
}

// Light summaries only, newest first, with how many versions each resume has.
export async function listResumes(clientId: string, { limit, offset }: PageQuery): Promise<PageDto<ResumeDto>> {
  const [rows, [{ total }]] = await Promise.all([
    db.query.resumes.findMany({
      where: eq(resumes.clientId, clientId),
      orderBy: desc(resumes.createdAt),
      limit,
      offset,
    }),
    db.select({ total: sql<number>`count(*)::int` }).from(resumes).where(eq(resumes.clientId, clientId)),
  ])
  const usage = await usageFor(clientId, rows.map((r) => r.id))
  return { items: rows.map((r) => toDto(r, usage.get(r.id))), total }
}

export async function getResume(id: string, clientId: string): Promise<ResumeDetailDto> {
  const row = await db.query.resumes.findFirst({
    where: and(eq(resumes.id, id), eq(resumes.clientId, clientId)),
  })
  if (!row) throw notFound('Resume')
  const usage = (await usageFor(clientId, [row.id])).get(row.id)
  return { ...toDto(row, usage), structured: row.structured }
}

// Cascades to this resume's customizations and their cover letters.
export async function deleteResume(id: string, clientId: string): Promise<void> {
  const [row] = await db
    .delete(resumes)
    .where(and(eq(resumes.id, id), eq(resumes.clientId, clientId)))
    .returning({ id: resumes.id })
  if (!row) throw notFound('Resume')
}
