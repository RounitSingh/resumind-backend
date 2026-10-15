import PDFDocument from 'pdfkit'
import {
  AlignmentType,
  BorderStyle,
  Document,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
  type IRunOptions,
} from 'docx'
import { resumeToText } from '../../shared/resume-text.js'
import type { StructuredResume } from '../../types/domain.js'
import { ExportFormat } from '../../types/enums.js'

export const MIME: Record<ExportFormat, string> = {
  [ExportFormat.Pdf]: 'application/pdf',
  [ExportFormat.Docx]: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  [ExportFormat.Txt]: 'text/plain; charset=utf-8',
}

export const exportFileName = (resume: StructuredResume, role: string, format: ExportFormat): string => {
  const slug = [resume.name, role]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'resume'}.${format}`
}

export async function renderResume(resume: StructuredResume, format: ExportFormat): Promise<Buffer> {
  if (format === ExportFormat.Txt) return Buffer.from(resumeToText(resume), 'utf8')
  if (format === ExportFormat.Docx) return renderDocx(resume)
  return renderPdf(resume)
}

// ---------- PDF (built-in Latin-1 fonts: map smart punctuation, drop the rest) ----------
const latin = (s = ''): string =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•▪●]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '')

function renderPdf(r: StructuredResume): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const width = doc.page.width - left - doc.page.margins.right

    const heading = (t: string): void => {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor('#000').text(latin(t).toUpperCase(), left, doc.y)
      const y = doc.y + 1
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).stroke('#888')
      doc.moveDown(0.3)
    }
    const roleLine = (l: string, rgt: string): void => {
      const y = doc.y
      doc.font('Helvetica-Bold').fontSize(10).text(latin(l), left, y, { width: width - 110 })
      const after = doc.y
      doc.font('Helvetica').text(latin(rgt), left, y, { width, align: 'right' })
      doc.y = Math.max(after, doc.y)
    }
    const bullets = (list: string[]): void => {
      doc.font('Helvetica').fontSize(10)
      for (const b of list) doc.text(`-  ${latin(b)}`, left + 8, doc.y, { width: width - 8 })
    }

    doc.font('Helvetica-Bold').fontSize(20).text(latin(r.name), { align: 'center' })
    if (r.headline) doc.font('Helvetica').fontSize(11).text(latin(r.headline), { align: 'center' })
    if (r.contact.length) doc.font('Helvetica').fontSize(9).text(latin(r.contact.join('  |  ')), { align: 'center' })

    if (r.summary) {
      heading('Summary')
      doc.font('Helvetica').fontSize(10).text(latin(r.summary), left, doc.y, { width })
    }
    if (r.skills.length) {
      heading('Skills')
      doc.font('Helvetica').fontSize(10)
      doc.text(latin(r.skills.join(', ')), left, doc.y, { width })
    }
    if (r.experience.length) {
      heading('Experience')
      for (const e of r.experience) {
        roleLine(`${e.title}, ${e.company}`, e.period)
        bullets(e.bullets)
        doc.moveDown(0.3)
      }
    }
    if (r.projects.length) {
      heading('Projects')
      for (const p of r.projects) {
        roleLine(p.name, p.tech)
        bullets(p.bullets)
        doc.moveDown(0.3)
      }
    }
    if (r.education.length) {
      heading('Education')
      for (const e of r.education) {
        roleLine(`${e.degree}, ${e.institution}`, e.period)
        if (e.details) doc.font('Helvetica').fontSize(10).text(latin(e.details), left, doc.y, { width })
      }
    }
    if (r.certifications.length) {
      heading('Certifications')
      bullets(r.certifications)
    }
    for (const a of r.additional) {
      heading(a.title)
      doc.font('Helvetica').fontSize(10).text(latin(a.items.join(', ')), left, doc.y, { width })
    }
    doc.end()
  })
}

// ---------- DOCX ----------
function renderDocx(r: StructuredResume): Promise<Buffer> {
  const font = 'Calibri'
  const run = (text: string, o: Partial<IRunOptions> = {}): TextRun => new TextRun({ text, font, size: 20, ...o })

  const heading = (t: string): Paragraph =>
    new Paragraph({
      spacing: { before: 200, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '888888', space: 1 } },
      children: [run(t.toUpperCase(), { bold: true, size: 22 })],
    })
  const para = (text: string): Paragraph => new Paragraph({ children: [run(text)] })
  const roleLine = (l: string, rgt: string): Paragraph =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      spacing: { before: 80 },
      children: [run(l, { bold: true }), run(`\t${rgt}`)],
    })
  const bullet = (t: string): Paragraph =>
    new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [run(t)] })

  const body: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.name, { bold: true, size: 36 })] }),
  ]
  if (r.headline) {
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.headline, { size: 22 })] }))
  }
  if (r.contact.length) {
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [run(r.contact.join('  |  '), { size: 18 })] }))
  }

  if (r.summary) body.push(heading('Summary'), para(r.summary))
  if (r.skills.length) body.push(heading('Skills'), para(r.skills.join(', ')))
  if (r.experience.length) {
    body.push(heading('Experience'))
    for (const e of r.experience) body.push(roleLine(`${e.title}, ${e.company}`, e.period), ...e.bullets.map(bullet))
  }
  if (r.projects.length) {
    body.push(heading('Projects'))
    for (const p of r.projects) body.push(roleLine(p.name, p.tech), ...p.bullets.map(bullet))
  }
  if (r.education.length) {
    body.push(heading('Education'))
    for (const e of r.education) {
      body.push(roleLine(`${e.degree}, ${e.institution}`, e.period))
      if (e.details) body.push(para(e.details))
    }
  }
  if (r.certifications.length) body.push(heading('Certifications'), ...r.certifications.map(bullet))
  for (const a of r.additional) body.push(heading(a.title), para(a.items.join(', ')))

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children: body }],
  })
  return Packer.toBuffer(doc)
}
