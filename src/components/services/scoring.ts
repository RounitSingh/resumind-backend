import { resumeToText } from '../../shared/resume-text.js'
import type { AtsCheck, JdRequirements, Scores, StructuredResume } from '../../types/domain.js'

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Boundary-aware match that works for "C++", "Node.js", ".NET".
export const containsTerm = (text: string, term: string): boolean =>
  new RegExp(`(^|[^a-z0-9])${escapeRe(term.toLowerCase().trim())}($|[^a-z0-9])`, 'i').test(text)

interface Weighted {
  label: string
  weight: number
}

// Must-have skills count double.
function keywordWeights(r: JdRequirements): Map<string, Weighted> {
  const map = new Map<string, Weighted>()
  const add = (terms: string[], weight: number): void => {
    for (const t of terms) {
      const key = t.toLowerCase().trim()
      if (!key || key.length > 40) continue
      if ((map.get(key)?.weight ?? 0) < weight) map.set(key, { label: t.trim(), weight })
    }
  }
  add(r.keywords, 1)
  add(r.niceToHaveSkills, 1)
  add(r.mustHaveSkills, 2)
  return map
}

interface MatchResult {
  score: number
  matched: string[]
  missing: string[]
}

function matchText(text: string, weights: Map<string, Weighted>): MatchResult {
  let total = 0
  let got = 0
  const matched: string[] = []
  const missing: string[] = []
  for (const [key, { label, weight }] of weights) {
    total += weight
    if (containsTerm(text, key)) {
      got += weight
      matched.push(label)
    } else {
      missing.push(label)
    }
  }
  return { score: total ? Math.round((got / total) * 100) : 0, matched, missing }
}

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/

function atsChecks(resume: StructuredResume, matchAfter: number): AtsCheck[] {
  const bullets = [...resume.experience, ...resume.projects].flatMap((x) => x.bullets)
  const contact = resume.contact.join(' ')
  const skillCount = resume.skills.length
  const summaryWords = wordCount(resume.summary)
  const quantified = bullets.length ? bullets.filter((b) => /\d/.test(b)).length / bullets.length : 0
  const concise = bullets.length
    ? bullets.filter((b) => {
        const w = wordCount(b)
        return w >= 8 && w <= 35
      }).length / bullets.length
    : 0

  const keywordPoints = Math.round((35 * Math.min(matchAfter, 80)) / 80)
  const pf = (name: string, points: number, passed: boolean, tip: string): AtsCheck => ({
    name,
    points,
    earned: passed ? points : 0,
    passed,
    tip: passed ? undefined : tip,
  })

  return [
    {
      name: 'JD keyword coverage',
      points: 35,
      earned: keywordPoints,
      passed: matchAfter >= 80,
      tip: matchAfter >= 80 ? undefined : 'Add more truthful JD keywords to your skills and bullets.',
    },
    pf('Professional summary', 10, summaryWords >= 20 && summaryWords <= 90, 'Write a 20-90 word summary.'),
    pf('Skills section', 10, skillCount >= 8, 'List at least 8 skills.'),
    pf(
      'Experience or projects present',
      10,
      resume.experience.length + resume.projects.length > 0,
      'Add at least one experience or project entry.',
    ),
    pf('Quantified achievements', 10, quantified >= 0.3, 'Add numbers to at least 30% of bullets.'),
    pf('Email in header', 8, EMAIL.test(contact), 'Add an email address to your contact line.'),
    pf('Concise bullets', 7, concise >= 0.8, 'Keep bullets between 8 and 35 words.'),
    pf('Phone in header', 5, PHONE.test(contact), 'Add a phone number to your contact line.'),
    pf('Education section', 5, resume.education.length > 0, 'Add an education entry.'),
  ]
}

// Deterministic: same input, same score, every point explainable.
export function computeScores(
  originalRawText: string,
  tailored: StructuredResume,
  requirements: JdRequirements,
): Scores {
  const weights = keywordWeights(requirements)
  const before = matchText(originalRawText, weights)
  const after = matchText(resumeToText(tailored), weights)
  const checks = atsChecks(tailored, after.score)

  return {
    match: { before: before.score, after: after.score, matched: after.matched, missing: after.missing },
    ats: {
      score: checks.reduce((n, c) => n + c.earned, 0),
      passed: checks.filter((c) => c.passed).length,
      total: checks.length,
      checks,
    },
  }
}

// Tailored skills that don't appear in the original text: shown as "please verify".
export function findUnverifiedSkills(originalRawText: string, tailored: StructuredResume): string[] {
  return tailored.skills.filter((item) => !containsTerm(originalRawText, item))
}
