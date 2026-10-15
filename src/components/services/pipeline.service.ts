import { and, eq, inArray, lt } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { customizations, jobDescriptions, resumes } from '../../db/schema.js'
import { AppError } from '../../lib/errors.js'
import { analyzeJobDescription, reviewResume, structureResume, tailorResume } from '../../llm/tasks.js'
import type { TailorResult } from '../../types/domain.js'
import { CustomizationStatus, ErrorCode, SectionKey } from '../../types/enums.js'
import { enforceInvariants } from './invariants.js'
import { computeScores, findUnverifiedSkills } from './scoring.js'

const setStatus = (id: string, status: CustomizationStatus) =>
  db.update(customizations).set({ status, updatedAt: new Date() }).where(eq(customizations.id, id))

const failAnalysis = (id: string, started: number, err: unknown) => {
  console.error(`Pipeline ${id} failed:`, err)
  const message = err instanceof AppError ? err.message : 'Analysis failed. Please try again.'
  return db
    .update(customizations)
    .set({ status: CustomizationStatus.Failed, error: message, latencyMs: Date.now() - started, updatedAt: new Date() })
    .where(eq(customizations.id, id))
    .catch((e: unknown) => console.error('Could not store failure', e))
}

// Phase 1, runs in the background after POST /customizations has returned 202.
// queued -> analyzing -> review (stats + feedback on the ORIGINAL resume; waits for the user) | failed
export async function runAnalysis(id: string): Promise<void> {
  const started = Date.now()
  try {
    const job = await db.query.customizations.findFirst({
      where: eq(customizations.id, id),
      with: { resume: true, jobDescription: true },
    })
    if (!job) return

    await setStatus(id, CustomizationStatus.Analyzing)

    // Resume structuring (skipped when cached on the resume) and JD analysis run in parallel.
    const [original, requirements] = await Promise.all([
      job.resume.structured ??
        structureResume(job.resume.rawText, id).then(async (s) => {
          await db.update(resumes).set({ structured: s }).where(eq(resumes.id, job.resumeId))
          return s
        }),
      analyzeJobDescription(job.jobDescription.jobDescription, id).then(async (r) => {
        await db
          .update(jobDescriptions)
          .set({ role: r.role, company: r.company, experience: r.experience })
          .where(eq(jobDescriptions.id, job.jobDescriptionId))
        await db.update(customizations).set({ jdAnalysis: r }).where(eq(customizations.id, id))
        return r
      }),
    ])

    const review = await reviewResume({ resume: original, requirements, jobDescription: job.jobDescription.jobDescription }, id)

    // Nothing is tailored yet, so "after" equals "before"; the UI shows the current score.
    const scores = computeScores(job.resume.rawText, original, requirements)

    await db
      .update(customizations)
      .set({
        status: CustomizationStatus.Review,
        review,
        scores,
        matchBefore: scores.match.before,
        matchAfter: scores.match.before,
        atsScore: scores.ats.score,
        latencyMs: Date.now() - started,
        updatedAt: new Date(),
      })
      .where(eq(customizations.id, id))
  } catch (err) {
    await failAnalysis(id, started, err)
  }
}

// Phase 2, started by POST /customizations/:id/tailor ("Update resume").
// review -> tailoring -> scoring -> completed. On failure it returns to review with an error, so the user can retry.
export async function runTailoring(id: string): Promise<void> {
  const started = Date.now()
  try {
    const job = await db.query.customizations.findFirst({
      where: eq(customizations.id, id),
      with: { resume: true, jobDescription: true },
    })
    if (!job) return
    const original = job.resume.structured
    const requirements = job.jdAnalysis
    if (!original || !requirements) throw new AppError(409, ErrorCode.NotReady, 'Analysis is not finished yet.')

    const output = await tailorResume(
      {
        resume: original,
        requirements,
        jobDescription: job.jobDescription.jobDescription,
        sections: job.sections,
        tone: job.tone,
      },
      id,
    )

    await setStatus(id, CustomizationStatus.Scoring)
    const tailored = enforceInvariants(original, output.resume, job.sections)
    const result: TailorResult = {
      ...output,
      resume: tailored,
      unverifiedSkills: job.sections.includes(SectionKey.Skills)
        ? findUnverifiedSkills(job.resume.rawText, tailored)
        : [],
    }
    const scores = computeScores(job.resume.rawText, tailored, requirements)

    await db
      .update(customizations)
      .set({
        status: CustomizationStatus.Completed,
        result,
        scores,
        matchBefore: scores.match.before,
        matchAfter: scores.match.after,
        atsScore: scores.ats.score,
        latencyMs: Date.now() - started,
        updatedAt: new Date(),
      })
      .where(eq(customizations.id, id))
  } catch (err) {
    console.error(`Tailoring ${id} failed:`, err)
    const message = err instanceof AppError ? err.message : 'Tailoring failed. Please try again.'
    await db
      .update(customizations)
      .set({ status: CustomizationStatus.Review, error: message, updatedAt: new Date() })
      .where(eq(customizations.id, id))
      .catch((e: unknown) => console.error('Could not store failure', e))
  }
}

// On boot: anything still "processing" after 5 minutes was interrupted by a restart.
// An interrupted tailoring goes back to review (the analysis is intact); anything earlier failed.
export async function recoverStaleJobs(): Promise<void> {
  const stale = lt(customizations.updatedAt, new Date(Date.now() - 5 * 60_000))
  const interrupted = 'Processing was interrupted. Please try again.'
  await db
    .update(customizations)
    .set({ status: CustomizationStatus.Failed, error: interrupted, updatedAt: new Date() })
    .where(
      and(inArray(customizations.status, [CustomizationStatus.Queued, CustomizationStatus.Analyzing]), stale),
    )
  await db
    .update(customizations)
    .set({ status: CustomizationStatus.Review, error: interrupted, updatedAt: new Date() })
    .where(and(inArray(customizations.status, [CustomizationStatus.Tailoring, CustomizationStatus.Scoring]), stale))
}
