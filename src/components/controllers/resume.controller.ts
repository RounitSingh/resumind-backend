import type { Request, RequestHandler } from 'express'
import { notFound } from '../../lib/errors.js'
import { idParamSchema, pageQuerySchema } from '../../types/dto.js'
import { createResume, deleteResume, getResume, listResumes } from '../services/resume.service.js'

// A non-UUID id would make Postgres throw a 500; treat it as "not found" instead.
const parseId = (req: Request<{ id: string }>): string => {
  const r = idParamSchema.safeParse(req.params.id)
  if (!r.success) throw notFound('Resume')
  return r.data
}

export const uploadResume: RequestHandler = async (req, res) => {
  const resume = await createResume(req.clientId, req.file)
  res.status(201).json(resume)
}

export const list: RequestHandler = async (req, res) => {
  res.json(await listResumes(req.clientId, pageQuerySchema.parse(req.query)))
}

export const get: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getResume(parseId(req), req.clientId))
}

export const remove: RequestHandler<{ id: string }> = async (req, res) => {
  await deleteResume(parseId(req), req.clientId)
  res.status(204).end()
}
