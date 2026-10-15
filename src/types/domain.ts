import type { SectionKey, Seniority } from './enums.js'

// ===== Structured resume (LLM-parsed, stored as jsonb) =====
export interface ExperienceEntry {
  title: string
  company: string
  location: string
  period: string
  bullets: string[]
}

export interface ProjectEntry {
  name: string
  tech: string
  bullets: string[]
}

export interface EducationEntry {
  degree: string
  institution: string
  period: string
  details: string
}

export interface AdditionalEntry {
  title: string
  items: string[]
}

export interface StructuredResume {
  name: string
  headline: string
  contact: string[]
  summary: string
  skills: string[]
  experience: ExperienceEntry[]
  projects: ProjectEntry[]
  education: EducationEntry[]
  certifications: string[]
  additional: AdditionalEntry[]
}

// ===== Job description analysis =====
export interface JdRequirements {
  role: string
  company: string
  experience: string
  seniority: Seniority | string
  mustHaveSkills: string[]
  niceToHaveSkills: string[]
  keywords: string[]
  responsibilities: string[]
}

// ===== Review (feedback on the original resume, before tailoring) =====
export interface ReviewItem {
  section: string
  issue: string
  suggestion: string
  priority: 'high' | 'medium' | 'low'
}

export interface ReviewResult {
  verdict: string
  items: ReviewItem[]
}

export interface ReviewInput {
  resume: StructuredResume
  requirements: JdRequirements
  jobDescription: string
}

// ===== Tailoring output =====
export interface TailorChange {
  section: string
  description: string
}

export interface MissingKeyword {
  keyword: string
  suggestion: string
}

export interface TailorOutput {
  resume: StructuredResume
  changes: TailorChange[]
  missingKeywords: MissingKeyword[]
}

export interface TailorResult extends TailorOutput {
  unverifiedSkills: string[]
}

// ===== Scoring =====
export interface AtsCheck {
  name: string
  points: number
  earned: number
  passed: boolean
  tip?: string
}

export interface Scores {
  match: { before: number; after: number; matched: string[]; missing: string[] }
  ats: { score: number; passed: number; total: number; checks: AtsCheck[] }
}

export interface TailorInput {
  resume: StructuredResume
  requirements: JdRequirements
  jobDescription: string
  sections: SectionKey[]
  tone: import('./enums.js').Tone
}

export interface CoverLetterInput {
  resume: StructuredResume
  requirements: JdRequirements | null
  jobDescription: string
  tone: import('./enums.js').Tone
}
