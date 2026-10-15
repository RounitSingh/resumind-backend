import { Type, type Schema } from '@google/genai'
import { z } from 'zod'
import type { JdRequirements, ReviewResult, StructuredResume, TailorOutput } from '../types/domain.js'

// ---- Gemini responseSchema helpers (constrain generation) ----
const str: Schema = { type: Type.STRING }
const arr = (items: Schema): Schema => ({ type: Type.ARRAY, items })
const obj = (props: Record<string, Schema>): Schema => ({
  type: Type.OBJECT,
  properties: props,
  required: Object.keys(props),
})

// ---- Zod helpers (lenient: a missing field never fails a whole run) ----
const zStr = z.string().nullish().transform((v) => v ?? '')
const zArr = <T extends z.ZodTypeAny>(item: T) => z.array(item).nullish().transform((v) => v ?? [])

// ===== StructuredResume =====
export const geminiResumeSchema = obj({
  name: str,
  headline: str,
  contact: arr(str),
  summary: str,
  skills: arr(str),
  experience: arr(obj({ title: str, company: str, location: str, period: str, bullets: arr(str) })),
  projects: arr(obj({ name: str, tech: str, bullets: arr(str) })),
  education: arr(obj({ degree: str, institution: str, period: str, details: str })),
  certifications: arr(str),
  additional: arr(obj({ title: str, items: arr(str) })),
})

export const resumeValidator: z.ZodType<StructuredResume, z.ZodTypeDef, unknown> = z.object({
  name: zStr,
  headline: zStr,
  contact: zArr(z.string()),
  summary: zStr,
  skills: zArr(z.string()),
  experience: zArr(
    z.object({ title: zStr, company: zStr, location: zStr, period: zStr, bullets: zArr(z.string()) }),
  ),
  projects: zArr(z.object({ name: zStr, tech: zStr, bullets: zArr(z.string()) })),
  education: zArr(z.object({ degree: zStr, institution: zStr, period: zStr, details: zStr })),
  certifications: zArr(z.string()),
  additional: zArr(z.object({ title: zStr, items: zArr(z.string()) })),
})

// ===== JdRequirements =====
export const geminiJdSchema = obj({
  role: str,
  company: str,
  experience: str,
  seniority: str,
  mustHaveSkills: arr(str),
  niceToHaveSkills: arr(str),
  keywords: arr(str),
  responsibilities: arr(str),
})

export const jdValidator: z.ZodType<JdRequirements, z.ZodTypeDef, unknown> = z.object({
  role: zStr,
  company: zStr,
  experience: zStr,
  seniority: zStr,
  mustHaveSkills: zArr(z.string()),
  niceToHaveSkills: zArr(z.string()),
  keywords: zArr(z.string()),
  responsibilities: zArr(z.string()),
})

// ===== TailorOutput =====
export const geminiTailorSchema = obj({
  resume: geminiResumeSchema,
  changes: arr(obj({ section: str, description: str })),
  missingKeywords: arr(obj({ keyword: str, suggestion: str })),
})

export const tailorValidator: z.ZodType<TailorOutput, z.ZodTypeDef, unknown> = z.object({
  resume: resumeValidator,
  changes: zArr(z.object({ section: zStr, description: zStr })),
  missingKeywords: zArr(z.object({ keyword: zStr, suggestion: zStr })),
})

// ===== ReviewResult =====
export const geminiReviewSchema = obj({
  verdict: str,
  items: arr(obj({ section: str, issue: str, suggestion: str, priority: str })),
})

const zPriority = z
  .string()
  .nullish()
  .transform((v): 'high' | 'medium' | 'low' => {
    const p = (v ?? '').toLowerCase()
    return p === 'high' || p === 'low' ? p : 'medium'
  })

export const reviewValidator: z.ZodType<ReviewResult, z.ZodTypeDef, unknown> = z.object({
  verdict: zStr,
  items: zArr(z.object({ section: zStr, issue: zStr, suggestion: zStr, priority: zPriority })),
})
