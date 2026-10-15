import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { coverLetters, customizations, jobDescriptions, resumes } from '../../db/schema.js'
import { notFound, notReady } from '../../lib/errors.js'
import { writeCoverLetter } from '../../llm/tasks.js'
import type { StructuredResume } from '../../types/domain.js'
import type {
  CoverLetterResponseDto,
  CreateCustomizationDto,
  CustomizationDetailDto,
  CustomizationStartDto,
  CustomizationSummaryDto,
  CustomizationListQuery,
  PageDto,
} from '../../types/dto.js'
import { CustomizationStatus, Tone } from '../../types/enums.js'
import { runAnalysis, runTailoring } from './pipeline.service.js'

const geminiModel = (): string => process.env.GEMINI_MODEL ?? 'gemini-3.5-flash'

// Rows owned by another client behave exactly like missing rows (404, never 403).
async function findOwned(id: string, clientId: string) {
  const row = await db.query.customizations.findFirst({
    where: and(eq(customizations.id, id), eq(customizations.clientId, clientId)),
    with: {
      resume: true,
      jobDescription: true,
      coverLetters: { orderBy: (cl, { desc }) => [desc(cl.createdAt)], limit: 1 },
    },
  })
  if (!row) throw notFound('Customization')
  return row
}

const toLetterDto = (l: typeof coverLetters.$inferSelect): CoverLetterResponseDto => ({
  id: l.id,
  tone: l.tone,
  content: l.content,
  createdAt: l.createdAt,
})

export async function startCustomization(
  clientId: string,
  input: CreateCustomizationDto,
): Promise<CustomizationStartDto> {
  const resume = await db.query.resumes.findFirst({
    where: and(eq(resumes.id, input.resumeId), eq(resumes.clientId, clientId)),
    columns: { id: true },
  })
  if (!resume) throw notFound('Resume')

  // role / company / experience are filled in by the pipeline once the JD is analyzed.
  const [jd] = await db
    .insert(jobDescriptions)
    .values({ jobDescription: input.jobDescription })
    .returning({ id: jobDescriptions.id })

  const [row] = await db
    .insert(customizations)
    .values({
      clientId,
      resumeId: resume.id,
      jobDescriptionId: jd!.id,
      sections: input.sections,
      tone: input.tone,
      model: geminiModel(),
    })
    .returning({ id: customizations.id, status: customizations.status })

  // Background job. In production, enqueue to a worker (BullMQ) instead.
  setImmediate(() => void runAnalysis(row!.id))
  return row!
}

// "Update resume": review -> tailoring. The conditional update makes a double click start only one job.
export async function startTailoring(id: string, clientId: string): Promise<CustomizationStartDto> {
  await findOwned(id, clientId)
  const [row] = await db
    .update(customizations)
    .set({ status: CustomizationStatus.Tailoring, error: null, updatedAt: new Date() })
    .where(
      and(
        eq(customizations.id, id),
        eq(customizations.clientId, clientId),
        eq(customizations.status, CustomizationStatus.Review),
      ),
    )
    .returning({ id: customizations.id, status: customizations.status })
  if (!row) throw notReady()

  setImmediate(() => void runTailoring(id))
  return row
}

// History: light summaries only, newest first. Optionally one resume's versions.
export async function listCustomizations(
  clientId: string,
  { limit, offset, resumeId }: CustomizationListQuery,
): Promise<PageDto<CustomizationSummaryDto>> {
  const where = and(
    eq(customizations.clientId, clientId),
    resumeId ? eq(customizations.resumeId, resumeId) : undefined,
  )
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: customizations.id,
        resumeId: customizations.resumeId,
        status: customizations.status,
        createdAt: customizations.createdAt,
        matchBefore: customizations.matchBefore,
        matchAfter: customizations.matchAfter,
        atsScore: customizations.atsScore,
        role: jobDescriptions.role,
        company: jobDescriptions.company,
        fileName: resumes.fileName,
      })
      .from(customizations)
      .innerJoin(resumes, eq(customizations.resumeId, resumes.id))
      .innerJoin(jobDescriptions, eq(customizations.jobDescriptionId, jobDescriptions.id))
      .where(where)
      .orderBy(desc(customizations.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(customizations).where(where),
  ])
  return { items: rows.map((r) => ({ ...r, role: r.role || null, company: r.company || null })), total }
}

// Detail DTO polled by the result page.
export async function getCustomization(id: string, clientId: string): Promise<CustomizationDetailDto> {
  const row = await findOwned(id, clientId)
  const letter = row.coverLetters[0]
  const jd = row.jobDescription
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    sections: row.sections,
    tone: row.tone,
    createdAt: row.createdAt,
    resume: {
      id: row.resume.id,
      fileName: row.resume.fileName,
      fileSize: row.resume.fileSize,
      mimeType: row.resume.mimeType,
    },
    jobDescription: {
      role: jd.role,
      company: jd.company,
      experience: jd.experience,
      content: jd.jobDescription,
      requirements: row.jdAnalysis,
    },
    original: row.resume.structured,
    review: row.review,
    result: row.result,
    scores: row.scores,
    coverLetter: letter ? toLetterDto(letter) : null,
  }
}

// Used by export: only completed rows have a tailored resume.
export async function getCompletedResult(
  id: string,
  clientId: string,
): Promise<{ resume: StructuredResume; role: string }> {
  const row = await findOwned(id, clientId)
  if (row.status !== CustomizationStatus.Completed || !row.result) throw notReady()
  return { resume: row.result.resume, role: row.jobDescription.role }
}

export async function createCoverLetter(id: string, clientId: string, tone: Tone): Promise<CoverLetterResponseDto> {
  const row = await findOwned(id, clientId)
  if (row.status !== CustomizationStatus.Completed || !row.result) throw notReady()

  const content = await writeCoverLetter(
    {
      resume: row.result.resume,
      requirements: row.jdAnalysis,
      jobDescription: row.jobDescription.jobDescription,
      tone,
    },
    id,
  )
  const [letter] = await db
    .insert(coverLetters)
    .values({ customizationId: id, tone, content, model: geminiModel() })
    .returning()
  return toLetterDto(letter!)
}

// Cascades to cover letters; llm_runs keep their stats with a null customization_id.
// The job description row belongs to this customization alone, so it goes too.
export async function deleteCustomization(id: string, clientId: string): Promise<void> {
  const row = await findOwned(id, clientId)
  await db.delete(jobDescriptions).where(eq(jobDescriptions.id, row.jobDescriptionId))
}
