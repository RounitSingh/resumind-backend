import { ApiError, GoogleGenAI, type GenerateContentResponse, type Schema } from '@google/genai'
import type { z } from 'zod'
import { AppError } from '../lib/errors.js'
import { ErrorCode, type LlmTask } from '../types/enums.js'
import { logRun, type LlmRunRow } from './run-log.js'

export const MODEL = (): string => process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'
// Used for the last attempts when the primary model keeps returning 429/5xx (overload).
const FALLBACK_MODEL = (): string | undefined => process.env.GEMINI_FALLBACK_MODEL || undefined
// After the primary model is overloaded, go straight to the fallback for a while.
const PRIMARY_COOLDOWN_MS = 60_000
let primaryDownUntil = 0
const TIMEOUT_MS = (): number => Number(process.env.LLM_TIMEOUT_MS ?? 60_000)

let client: GoogleGenAI | undefined
const getClient = (): GoogleGenAI => {
  if (!process.env.GEMINI_API_KEY) {
    throw new AppError(502, ErrorCode.LlmUnavailable, 'AI service is not configured.')
  }
  return (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }))
}

// Dev-only: print raw model responses (set LLM_DEBUG=false to silence, LLM_DEBUG=true to force on).
const debugOn = (): boolean => (process.env.LLM_DEBUG ?? String(process.env.NODE_ENV !== 'production')) === 'true'
const debugLog = (task: LlmTask, model: string, res: GenerateContentResponse): void => {
  if (!debugOn()) return
  console.log(
    `[LLM ${task}] model=${model} tokens in=${res.usageMetadata?.promptTokenCount ?? '?'} out=${res.usageMetadata?.candidatesTokenCount ?? '?'} finish=${res.candidates?.[0]?.finishReason ?? '?'}
${res.text ?? '(empty)'}`,
  )
}

class LlmOutputError extends Error {}

const isRetryable = (e: unknown): boolean =>
  e instanceof LlmOutputError ||
  e instanceof SyntaxError ||
  (e as Error | undefined)?.name === 'AbortError' ||
  (e instanceof ApiError && (e.status === 429 || e.status >= 500))

function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e
  if (e instanceof ApiError && e.status === 429) {
    return new AppError(503, ErrorCode.LlmBusy, 'AI service is at capacity. Try again in a minute.')
  }
  if (e instanceof LlmOutputError || e instanceof SyntaxError) {
    return new AppError(502, ErrorCode.LlmBadOutput, 'The AI returned an unusable answer. Please try again.')
  }
  if ((e as Error | undefined)?.name === 'AbortError') {
    return new AppError(504, ErrorCode.LlmUnavailable, 'The AI service timed out. Please try again.')
  }
  return new AppError(502, ErrorCode.LlmUnavailable, 'The AI service is unavailable. Please try again.')
}

// Caps simultaneous Gemini calls across all users so a burst queues up in memory instead of
// tripping the provider's rate limit. Raise LLM_CONCURRENCY on a paid key.
const MAX_CONCURRENT = (): number => Math.max(1, Number(process.env.LLM_CONCURRENCY ?? 3))
let active = 0
const waiting: Array<() => void> = []

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT()) {
    active++
    return
  }
  // the slot is handed over directly by releaseSlot, so `active` is not decremented in between
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function releaseSlot(): void {
  const next = waiting.shift()
  if (next) next()
  else active--
}

// Timeout + exponential backoff around any Gemini call.
async function withRetry<T>(
  task: LlmTask,
  run: (signal: AbortSignal, model: string) => Promise<T>,
  retries = 4,
): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    // wait for a slot BEFORE starting the timeout clock, so queue time doesn't count against it
    await acquireSlot()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS())
    const useFallback = attempt >= 1 || Date.now() < primaryDownUntil
    const model = useFallback ? (FALLBACK_MODEL() ?? MODEL()) : MODEL()
    let backoffMs = 0
    try {
      return await run(ctrl.signal, model)
    } catch (e) {
      last = e
      if (model === MODEL() && FALLBACK_MODEL() && e instanceof ApiError && (e.status === 429 || e.status >= 500)) {
        primaryDownUntil = Date.now() + PRIMARY_COOLDOWN_MS
      }
      console.warn(`LLM ${task} failed (attempt ${attempt}, ${model}):`, String(e))
      if (attempt === retries || !isRetryable(e)) break
      backoffMs = 2 ** attempt * 1000 + Math.random() * 400
    } finally {
      clearTimeout(timer)
      releaseSlot()
    }
    // sleep AFTER releasing the slot so a backing-off call doesn't block other users
    await new Promise((r) => setTimeout(r, backoffMs))
  }
  throw toAppError(last)
}

// Records one llm_runs row per task call (tokens, total latency incl. retries, outcome).
interface Usage {
  input?: number
  output?: number
}

async function tracked<T>(
  task: LlmTask,
  customizationId: string | undefined,
  call: (usage: Usage) => Promise<T>,
): Promise<T> {
  const started = Date.now()
  const usage: Usage = {}
  const row = (ok: boolean, error: string | null): LlmRunRow => ({
    customizationId: customizationId ?? null,
    task,
    model: MODEL(),
    inputTokens: usage.input ?? null,
    outputTokens: usage.output ?? null,
    latencyMs: Date.now() - started,
    ok,
    error,
  })
  try {
    const out = await call(usage)
    logRun(row(true, null))
    return out
  } catch (e) {
    logRun(row(false, String((e as Error | undefined)?.message ?? e).slice(0, 500)))
    throw e
  }
}

const readUsage = (usage: Usage, res: GenerateContentResponse): void => {
  usage.input = res.usageMetadata?.promptTokenCount
  usage.output = res.usageMetadata?.candidatesTokenCount
}

// Structured output: Gemini responseSchema + Zod validation. Invalid output is retried.
interface JsonRequest<T> {
  task: LlmTask
  customizationId?: string
  system: string
  prompt: string
  schema: Schema
  validator: z.ZodType<T, z.ZodTypeDef, unknown>
  temperature?: number
}

interface TextRequest {
  task: LlmTask
  customizationId?: string
  system: string
  prompt: string
  temperature?: number
}

export function generateJson<T>({
  task,
  customizationId,
  system,
  prompt,
  schema,
  validator,
  temperature = 0.3,
}: JsonRequest<T>): Promise<T> {
  return tracked(task, customizationId, (usage) =>
    withRetry(task, async (abortSignal, model) => {
      const res = await getClient().models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: system,
          temperature,
          responseMimeType: 'application/json',
          responseSchema: schema,
          abortSignal,
        },
      })
      readUsage(usage, res)
      debugLog(task, model, res)
      if (!res.text) throw new LlmOutputError('Empty response')
      const parsed = validator.safeParse(JSON.parse(res.text) as unknown)
      if (!parsed.success) throw new LlmOutputError(parsed.error.message)
      return parsed.data
    }),
  )
}

// Plain text (cover letter).
export function generateText({
  task,
  customizationId,
  system,
  prompt,
  temperature = 0.6,
}: TextRequest): Promise<string> {
  return tracked(task, customizationId, (usage) =>
    withRetry(task, async (abortSignal, model) => {
      const res = await getClient().models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, temperature, abortSignal },
      })
      readUsage(usage, res)
      debugLog(task, model, res)
      if (!res.text?.trim()) throw new LlmOutputError('Empty response')
      return res.text.trim()
    }),
  )
}
