import { Router } from 'express'
import { llmLimiter } from '../../middleware/rate-limit.js'
import { coverLetter, create, exportFile, get, list, remove, tailor } from '../controllers/customization.controller.js'

const router = Router()

router.post('/', llmLimiter, create) // start a tailoring job (202)
router.post('/:id/tailor', llmLimiter, tailor) // "Update resume": tailor after the review step
router.get('/', list) // history
router.get('/:id', get) // detail / polling
router.delete('/:id', remove) // delete a version and its cover letters
router.get('/:id/export', exportFile) // ?format=pdf|docx|txt
router.post('/:id/cover-letter', llmLimiter, coverLetter)

export default router
