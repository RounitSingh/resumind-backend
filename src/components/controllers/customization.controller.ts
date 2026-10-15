import type { Request, RequestHandler } from 'express'
import { notFound } from '../../lib/errors.js'
import {
  coverLetterSchema,
  createCustomizationSchema,
  customizationListQuerySchema,
  exportQuerySchema,
  idParamSchema,
} from '../../types/dto.js'
import {
  createCoverLetter,
  deleteCustomization,
  getCompletedResult,
  getCustomization,
  listCustomizations,
  startCustomization,
  startTailoring,
} from '../services/customization.service.js'
import { MIME, exportFileName, renderResume } from '../services/export.service.js'

// A non-UUID id would make Postgres throw a 500; treat it as "not found" instead.
const parseId = (req: Request<{ id: string }>): string => {
  const r = idParamSchema.safeParse(req.params.id)
  if (!r.success) throw notFound('Customization')
  return r.data
}

export const create: RequestHandler = async (req, res) => {
  const body = createCustomizationSchema.parse(req.body)
  res.status(202).json(await startCustomization(req.clientId, body))
}

export const tailor: RequestHandler<{ id: string }> = async (req, res) => {
  res.status(202).json(await startTailoring(parseId(req), req.clientId))
}

export const list: RequestHandler = async (req, res) => {
  res.json(await listCustomizations(req.clientId, customizationListQuerySchema.parse(req.query)))
}

export const get: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getCustomization(parseId(req), req.clientId))
}

export const exportFile: RequestHandler<{ id: string }> = async (req, res) => {
  const id = parseId(req)
  const { format } = exportQuerySchema.parse(req.query)
  const { resume, role } = await getCompletedResult(id, req.clientId)
  const buffer = await renderResume(resume, format)

  res.setHeader('Content-Type', MIME[format])
  res.setHeader('Content-Disposition', `attachment; filename="${exportFileName(resume, role, format)}"`)
  res.send(buffer)
}

export const coverLetter: RequestHandler<{ id: string }> = async (req, res) => {
  const id = parseId(req)
  const { tone } = coverLetterSchema.parse(req.body ?? {})
  res.status(201).json(await createCoverLetter(id, req.clientId, tone))
}

export const remove: RequestHandler<{ id: string }> = async (req, res) => {
  await deleteCustomization(parseId(req), req.clientId)
  res.status(204).end()
}
