import { Router } from 'express'
import { requireAuth } from '../../middleware/auth.js'
import authRoutes from './auth.routes.js'
import customizationRoutes from './customization.routes.js'
import resumeRoutes from './resume.routes.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.use('/auth', authRoutes)

// Everything below needs a valid JWT access token.
router.use(requireAuth)
router.use('/resumes', resumeRoutes)
router.use('/customizations', customizationRoutes)

export default router
