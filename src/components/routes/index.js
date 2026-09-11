import { Router } from 'express'
import userRoutes from './user.routes.js'

const router = Router()

router.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

router.use('/users', userRoutes)

export default router
