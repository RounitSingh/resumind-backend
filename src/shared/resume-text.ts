import type { StructuredResume } from '../types/domain.js'

// Structured resume -> plain text. Used by TXT export and by scoring.
export function resumeToText(r: StructuredResume): string {
  const out: string[] = []
  const section = (title: string) => out.push('', title.toUpperCase())

  out.push(r.name)
  if (r.headline) out.push(r.headline)
  if (r.contact?.length) out.push(r.contact.join(' | '))

  if (r.summary) {
    section('Summary')
    out.push(r.summary)
  }
  if (r.skills?.length) {
    section('Skills')
    out.push(r.skills.join(', '))
  }
  if (r.experience?.length) {
    section('Experience')
    for (const e of r.experience) {
      out.push(`${e.title}, ${e.company}${e.location ? ` (${e.location})` : ''}  ${e.period}`)
      for (const b of e.bullets) out.push(`- ${b}`)
    }
  }
  if (r.projects?.length) {
    section('Projects')
    for (const p of r.projects) {
      out.push(`${p.name}${p.tech ? ` | ${p.tech}` : ''}`)
      for (const b of p.bullets) out.push(`- ${b}`)
    }
  }
  if (r.education?.length) {
    section('Education')
    for (const e of r.education) {
      out.push(`${e.degree}, ${e.institution}  ${e.period}`)
      if (e.details) out.push(e.details)
    }
  }
  if (r.certifications?.length) {
    section('Certifications')
    for (const c of r.certifications) out.push(`- ${c}`)
  }
  for (const a of r.additional ?? []) {
    section(a.title)
    out.push(a.items.join(', '))
  }
  return out.join('\n')
}
