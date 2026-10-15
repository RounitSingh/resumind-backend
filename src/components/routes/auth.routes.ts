import { Router } from 'express'
import { requireAuth, requireRole } from '../../middleware/auth.js'
import { authLimiter } from '../../middleware/rate-limit.js'
import { UserRole } from '../../types/enums.js'
import { listUsers, login, logout, logoutAll, me, refresh, register, updateRole } from '../controllers/auth.controller.js'

const router = Router()

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.post('/refresh', refresh) // uses the httpOnly cookie
router.post('/logout', logout)
router.post('/logout-all', requireAuth, logoutAll)
router.get('/me', requireAuth, me)

// Admin only
router.get('/users', requireAuth, requireRole(UserRole.Admin), listUsers)
router.patch('/users/:id/role', requireAuth, requireRole(UserRole.Admin), updateRole)

export default router
