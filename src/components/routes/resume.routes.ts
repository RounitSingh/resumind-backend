import { Router } from 'express'
import { uploadResume as multerUpload } from '../../middleware/upload.js'
import { get, list, remove, uploadResume } from '../controllers/resume.controller.js'

const router = Router()

router.post('/', multerUpload, uploadResume) // POST /api/resumes (multipart, field "file")
router.get('/', list) // uploaded resumes
router.get('/:id', get) // one resume incl. structured JSON
router.delete('/:id', remove) // also deletes its customizations

export default router
