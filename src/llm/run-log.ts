import { db } from '../db/index.js'
import { llmRuns } from '../db/schema.js'

export type LlmRunRow = typeof llmRuns.$inferInsert

// Fire-and-forget: a logging failure must never fail the user's request.
export function logRun(row: LlmRunRow): void {
  db.insert(llmRuns)
    .values(row)
    .catch((e: unknown) => console.error('Could not log LLM run', e))
}
