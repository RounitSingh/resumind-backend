import { extractText, getDocumentProxy } from 'unpdf'
import mammoth from 'mammoth'
import { AppError } from '../../lib/errors.js'
import { LIMITS } from '../../shared/constants.js'
import { ErrorCode } from '../../types/enums.js'

type FileKind = 'pdf' | 'docx'

// MIME types are client-controlled, so check magic bytes too.
function detectKind(buf: Buffer): FileKind | null {
  if (buf.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf'
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'docx' // "PK" = zip container
  return null
}

export async function extractResumeText(buf: Buffer): Promise<string> {
  const kind = detectKind(buf)
  if (!kind) throw new AppError(415, ErrorCode.InvalidFileType, "This file isn't a valid PDF or DOCX.")

  let text: string
  try {
    if (kind === 'pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(buf))
      text = (await extractText(pdf, { mergePages: true })).text
    } else {
      text = (await mammoth.extractRawText({ buffer: buf })).value
    }
  } catch {
    throw new AppError(
      422,
      ErrorCode.UnreadableFile,
      "We couldn't open this file. It may be corrupted or password-protected.",
    )
  }

  text = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length < LIMITS.resumeMinChars) {
    throw new AppError(
      422,
      ErrorCode.EmptyResume,
      'Too little text found. If this is a scanned PDF, upload a text-based PDF or DOCX.',
    )
  }
  return text.slice(0, LIMITS.resumeMaxChars)
}
