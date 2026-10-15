import { ExportFormat, SectionKey, Tone } from '../types/enums.js'

export const SECTION_KEYS = Object.values(SectionKey) as [SectionKey, ...SectionKey[]]
export const TONES = Object.values(Tone) as [Tone, ...Tone[]]
export const EXPORT_FORMATS = Object.values(ExportFormat) as [ExportFormat, ...ExportFormat[]]

export const LIMITS = {
  jdMin: 100,
  jdMax: 20_000,
  resumeMinChars: 200,
  resumeMaxChars: 30_000,
} as const

export const MAX_RESUMES_PER_USER = Number(process.env.MAX_RESUMES_PER_USER ?? 20)
export const PAGE = { default: 24, max: 100 } as const

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 5)
