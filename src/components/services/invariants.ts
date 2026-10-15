import type { AdditionalEntry, EducationEntry, StructuredResume } from '../../types/domain.js'
import { SectionKey } from '../../types/enums.js'

// Code, not the LLM, owns the facts: identity, titles, companies, dates and degrees
// always come from the original. Unselected sections are restored.
export function enforceInvariants(
  orig: StructuredResume,
  tail: StructuredResume,
  sections: SectionKey[],
): StructuredResume {
  const on = new Set(sections)
  return {
    name: orig.name,
    contact: orig.contact,
    headline: on.has(SectionKey.Summary) ? tail.headline || orig.headline : orig.headline,
    summary: on.has(SectionKey.Summary) ? tail.summary || orig.summary : orig.summary,
    skills: on.has(SectionKey.Skills) && tail.skills.length ? tail.skills : orig.skills,
    experience: on.has(SectionKey.Experience)
      ? mergeBullets(orig.experience, tail.experience, (e) => e.title + e.company)
      : orig.experience,
    projects: on.has(SectionKey.Projects)
      ? mergeBullets(orig.projects, tail.projects, (p) => p.name)
      : orig.projects,
    education: on.has(SectionKey.Education) ? mergeEducation(orig.education, tail.education) : orig.education,
    certifications: on.has(SectionKey.Certifications)
      ? reorder(orig.certifications, tail.certifications, (c) => c)
      : orig.certifications,
    additional: on.has(SectionKey.Additional) ? mergeAdditional(orig.additional, tail.additional) : orig.additional,
  }
}

const norm = (s: string): string => s.toLowerCase().trim()

// Keep the original entry (title/company/dates); take only the bullets from the LLM.
function mergeBullets<T extends { bullets: string[] }>(orig: T[], tail: T[], key: (x: T) => string): T[] {
  return orig.map((o, i) => {
    const k = key(o).toLowerCase()
    const match = tail.find((t) => key(t).toLowerCase() === k) ?? tail[i]
    return { ...o, bullets: match?.bullets?.length ? match.bullets : o.bullets }
  })
}

// Degree, institution and period are facts; only the details text may change.
function mergeEducation(orig: EducationEntry[], tail: EducationEntry[]): EducationEntry[] {
  return orig.map((o, i) => {
    const match = tail.find((t) => norm(t.degree + t.institution) === norm(o.degree + o.institution)) ?? tail[i]
    return { ...o, details: match?.details || o.details }
  })
}

// Original items only, in the LLM's order. Anything the LLM added is dropped; anything it omitted is kept.
function reorder<T>(orig: T[], tail: T[], key: (x: T) => string): T[] {
  const byKey = new Map(orig.map((o) => [norm(key(o)), o]))
  const ordered: T[] = []
  for (const t of tail) {
    const hit = byKey.get(norm(key(t)))
    if (hit && !ordered.includes(hit)) ordered.push(hit)
  }
  return [...ordered, ...orig.filter((o) => !ordered.includes(o))]
}

function mergeAdditional(orig: AdditionalEntry[], tail: AdditionalEntry[]): AdditionalEntry[] {
  return reorder(orig, tail, (a) => a.title).map((o) => {
    const match = tail.find((t) => norm(t.title) === norm(o.title))
    return { ...o, items: match ? reorder(o.items, match.items, (i) => i) : o.items }
  })
}
