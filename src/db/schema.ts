import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import type { JdRequirements, ReviewResult, Scores, StructuredResume, TailorResult } from '../types/domain.js'
import { CustomizationStatus, LlmTask, SectionKey, Tone, UserRole } from '../types/enums.js'

// Job lifecycle: queued -> analyzing -> review -> tailoring -> scoring -> completed | failed
export const customizationStatus = pgEnum(
  'customization_status',
  Object.values(CustomizationStatus) as [CustomizationStatus, ...CustomizationStatus[]],
)

const ts = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull()

// Anonymous identity from the X-Client-Id header. Owns everything below.
export const clients = pgTable('clients', {
  id: varchar('id', { length: 64 }).primaryKey(),
  createdAt: ts('created_at'),
  lastSeenAt: ts('last_seen_at'),
})

// Registered account. users.id is also inserted into `clients` so it owns the rows below.
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 16 }).$type<UserRole>().notNull().default(UserRole.User),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), check('users_role_chk', sql`${t.role} in ('user','admin')`)],
)

// Opaque rotating refresh tokens; only the sha256 is stored.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: ts('created_at'),
  },
  (t) => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_user_idx').on(t.userId)],
)

// Uploaded resume: only extracted text is stored, never the file.
// `structured` caches the LLM-parsed resume JSON so later versions skip that call.
export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: varchar('client_id', { length: 64 })
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    fileSize: integer('file_size').notNull(),
    contentHash: varchar('content_hash', { length: 64 }).notNull(), // sha256 of raw_text
    rawText: text('raw_text').notNull(),
    structured: jsonb('structured').$type<StructuredResume>(),
    schemaVersion: integer('schema_version').notNull().default(1),
    createdAt: ts('created_at'),
  },
  (t) => [
    uniqueIndex('resumes_client_hash_uq').on(t.clientId, t.contentHash),
    index('resumes_client_created_idx').on(t.clientId, t.createdAt),
  ],
)

// The target job. Skills/keywords extracted from it live on customizations.jd_analysis.
export const jobDescriptions = pgTable('job_descriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  role: text('role').notNull().default(''),
  company: text('company').notNull().default(''),
  experience: text('experience').notNull().default(''),
  jobDescription: text('job_description').notNull(),
})

// One tailored version (the hub table). `status` drives the whole UI.
export const customizations = pgTable(
  'customizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: varchar('client_id', { length: 64 })
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    jobDescriptionId: uuid('job_description_id')
      .notNull()
      .references(() => jobDescriptions.id, { onDelete: 'cascade' }),
    status: customizationStatus('status').notNull().default(CustomizationStatus.Queued),
    sections: jsonb('sections').$type<SectionKey[]>().notNull(), // any of the 7 resume sections
    tone: varchar('tone', { length: 32 }).$type<Tone>().notNull(),
    jdAnalysis: jsonb('jd_analysis').$type<JdRequirements>(), // role, skills, keywords, responsibilities extracted from the JD
    review: jsonb('review').$type<ReviewResult>(), // feedback on the original resume, shown before tailoring
    result: jsonb('result').$type<TailorResult>(), // tailored resume + changes + missingKeywords + unverifiedSkills
    scores: jsonb('scores').$type<Scores>(), // match before/after, ATS score + checks
    matchBefore: integer('match_before'), // copies of scores, for sorting and filtering
    matchAfter: integer('match_after'),
    atsScore: integer('ats_score'),
    model: varchar('model', { length: 64 }).notNull(),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    createdAt: ts('created_at'),
    updatedAt: ts('updated_at'),
  },
  (t) => [
    index('customizations_client_created_idx').on(t.clientId, t.createdAt),
    index('customizations_status_idx').on(t.status),
    index('customizations_resume_idx').on(t.resumeId),
    check('customizations_tone_chk', sql`${t.tone} in ('professional','confident','concise')`),
    check(
      'customizations_sections_chk',
      sql`jsonb_typeof(${t.sections}) = 'array' and ${t.sections} <@ '["summary","skills","experience","projects","education","certifications","additional"]'::jsonb`,
    ),
    check(
      'customizations_scores_chk',
      sql`(${t.matchBefore} is null or ${t.matchBefore} between 0 and 100) and (${t.matchAfter} is null or ${t.matchAfter} between 0 and 100) and (${t.atsScore} is null or ${t.atsScore} between 0 and 100)`,
    ),
  ],
)

export const coverLetters = pgTable(
  'cover_letters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customizationId: uuid('customization_id')
      .notNull()
      .references(() => customizations.id, { onDelete: 'cascade' }),
    tone: varchar('tone', { length: 32 }).notNull(),
    content: text('content').notNull(),
    model: varchar('model', { length: 64 }),
    createdAt: ts('created_at'),
  },
  (t) => [index('cover_letters_customization_idx').on(t.customizationId)],
)

// One row per LLM call: tokens, latency and failures. Survives customization deletes.
export const llmRuns = pgTable(
  'llm_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customizationId: uuid('customization_id').references(() => customizations.id, { onDelete: 'set null' }),
    task: varchar('task', { length: 32 }).$type<LlmTask>().notNull(), // structure | analyze_jd | tailor | cover_letter
    model: varchar('model', { length: 64 }).notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    ok: boolean('ok').notNull(),
    error: text('error'),
    createdAt: ts('created_at'),
  },
  (t) => [index('llm_runs_customization_idx').on(t.customizationId)],
)

export const clientsRelations = relations(clients, ({ many }) => ({
  resumes: many(resumes),
  customizations: many(customizations),
}))

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  client: one(clients, { fields: [resumes.clientId], references: [clients.id] }),
  customizations: many(customizations),
}))

export const jobDescriptionsRelations = relations(jobDescriptions, ({ many }) => ({
  customizations: many(customizations),
}))

export const customizationsRelations = relations(customizations, ({ one, many }) => ({
  client: one(clients, { fields: [customizations.clientId], references: [clients.id] }),
  resume: one(resumes, {
    fields: [customizations.resumeId],
    references: [resumes.id],
  }),
  jobDescription: one(jobDescriptions, {
    fields: [customizations.jobDescriptionId],
    references: [jobDescriptions.id],
  }),
  coverLetters: many(coverLetters),
  llmRuns: many(llmRuns),
}))

export const coverLettersRelations = relations(coverLetters, ({ one }) => ({
  customization: one(customizations, {
    fields: [coverLetters.customizationId],
    references: [customizations.id],
  }),
}))

export const llmRunsRelations = relations(llmRuns, ({ one }) => ({
  customization: one(customizations, {
    fields: [llmRuns.customizationId],
    references: [customizations.id],
  }),
}))
