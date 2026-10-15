import type {
  CoverLetterInput,
  JdRequirements,
  ReviewInput,
  ReviewResult,
  StructuredResume,
  TailorInput,
  TailorOutput,
} from '../types/domain.js'
import { LlmTask } from '../types/enums.js'
import { generateJson, generateText } from './gemini.client.js'
import {
  geminiJdSchema,
  geminiResumeSchema,
  geminiReviewSchema,
  geminiTailorSchema,
  jdValidator,
  resumeValidator,
  reviewValidator,
  tailorValidator,
} from './schemas.js'
import {
  COVER_LETTER_SYSTEM,
  JD_SYSTEM,
  REVIEW_SYSTEM,
  RESUME_SYSTEM,
  TAILOR_SYSTEM,
  buildCoverLetterPrompt,
  buildJdPrompt,
  buildResumePrompt,
  buildReviewPrompt,
  buildTailorPrompt,
} from './prompts.js'

export const structureResume = (rawText: string, customizationId?: string): Promise<StructuredResume> =>
  generateJson({
    task: LlmTask.Structure,
    customizationId,
    system: RESUME_SYSTEM,
    prompt: buildResumePrompt(rawText),
    schema: geminiResumeSchema,
    validator: resumeValidator,
    temperature: 0,
  })

export const analyzeJobDescription = (jd: string, customizationId?: string): Promise<JdRequirements> =>
  generateJson({
    task: LlmTask.AnalyzeJd,
    customizationId,
    system: JD_SYSTEM,
    prompt: buildJdPrompt(jd),
    schema: geminiJdSchema,
    validator: jdValidator,
    temperature: 0.1,
  })

export const reviewResume = (input: ReviewInput, customizationId?: string): Promise<ReviewResult> =>
  generateJson({
    task: LlmTask.Review,
    customizationId,
    system: REVIEW_SYSTEM,
    prompt: buildReviewPrompt(input),
    schema: geminiReviewSchema,
    validator: reviewValidator,
    temperature: 0.3,
  })

export const tailorResume = (input: TailorInput, customizationId?: string): Promise<TailorOutput> =>
  generateJson({
    task: LlmTask.Tailor,
    customizationId,
    system: TAILOR_SYSTEM,
    prompt: buildTailorPrompt(input),
    schema: geminiTailorSchema,
    validator: tailorValidator,
    temperature: 0.4,
  })

export const writeCoverLetter = (input: CoverLetterInput, customizationId?: string): Promise<string> =>
  generateText({
    task: LlmTask.CoverLetter,
    customizationId,
    system: COVER_LETTER_SYSTEM,
    prompt: buildCoverLetterPrompt(input),
    temperature: 0.6,
  })
