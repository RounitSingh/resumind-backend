import { z } from 'zod'
import { EXPORT_FORMATS, LIMITS, PAGE, SECTION_KEYS } from '../shared/constants.js'
import { CustomizationStatus, ExportFormat, SectionKey, Tone, UserRole } from './enums.js'
import type { JdRequirements, ReviewResult, Scores, StructuredResume, TailorResult } from './domain.js'

// ===== Request DTOs (validated with zod) =====
export const createCustomizationSchema = z.object({
  resumeId: z.string().uuid('Invalid resume id.'),
  jobDescription: z
    .string()
    .trim()
    .min(LIMITS.jdMin, `Paste the full job description (at least ${LIMITS.jdMin} characters).`)
    .max(LIMITS.jdMax, `Job description is too long (max ${LIMITS.jdMax.toLocaleString('en-US')} characters).`),
  sections: z.array(z.nativeEnum(SectionKey)).min(1, 'Pick at least one section.').default([...SECTION_KEYS]),
  tone: z.nativeEnum(Tone).default(Tone.Professional),
})
export type CreateCustomizationDto = z.infer<typeof createCustomizationSchema>

export const exportQuerySchema = z.object({
  format: z.nativeEnum(ExportFormat, { message: 'format must be pdf, docx or txt.' }),
})
export type ExportQueryDto = z.infer<typeof exportQuerySchema>

export const coverLetterSchema = z.object({ tone: z.nativeEnum(Tone).default(Tone.Professional) })
export type CreateCoverLetterDto = z.infer<typeof coverLetterSchema>

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email.').max(254)
export const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long (max 128 characters).'),
})
export type RegisterDto = z.infer<typeof registerSchema>

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) })
export type LoginDto = z.infer<typeof loginSchema>

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE.max).default(PAGE.default),
  offset: z.coerce.number().int().min(0).default(0),
})
export const customizationListQuerySchema = pageQuerySchema.extend({
  resumeId: z.string().uuid('Invalid resume id.').optional(),
})
export type PageQuery = z.infer<typeof pageQuerySchema>
export type CustomizationListQuery = z.infer<typeof customizationListQuerySchema>

export const idParamSchema = z.string().uuid()

// ===== Response DTOs =====
export interface AuthUserDto {
  id: string
  email: string
  role: UserRole
  createdAt: Date
}

export interface ErrorResponseDto {
  error: { code: string; message: string; details: unknown }
}

export interface ResumeDto {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  charCount: number
  preview: string
  createdAt: Date
  customizationCount: number
  lastUsedAt: Date | null
}

export interface PageDto<T> {
  items: T[]
  total: number
}

export interface ResumeDetailDto extends ResumeDto {
  structured: StructuredResume | null
}

export interface CustomizationStartDto {
  id: string
  status: CustomizationStatus
}

export interface CustomizationSummaryDto {
  id: string
  resumeId: string
  status: CustomizationStatus
  createdAt: Date
  matchBefore: number | null
  matchAfter: number | null
  atsScore: number | null
  role: string | null
  company: string | null
  fileName: string
}

export interface CoverLetterResponseDto {
  id: string
  tone: string
  content: string
  createdAt: Date
}

export interface CustomizationDetailDto {
  id: string
  status: CustomizationStatus
  error: string | null
  sections: SectionKey[]
  tone: Tone
  createdAt: Date
  resume: { id: string; fileName: string; fileSize: number; mimeType: string }
  jobDescription: {
    role: string
    company: string
    experience: string
    content: string
    requirements: JdRequirements | null
  }
  original: StructuredResume | null
  review: ReviewResult | null
  result: TailorResult | null
  scores: Scores | null
  coverLetter: CoverLetterResponseDto | null
}
