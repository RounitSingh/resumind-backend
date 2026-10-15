import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import 'dotenv/config'
import routes from './components/routes/index.js'
import { allowedOrigins, checkOrigin } from './middleware/origin.js'
import { errorHandler } from './middleware/error-handler.js'
import type { ErrorResponseDto } from './types/dto.js'
import { ErrorCode } from './types/enums.js'

const app = express()

app.set('trust proxy', 1) // correct client IPs behind a proxy (Render)
app.use(helmet())
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // refresh-token cookie
    exposedHeaders: ['Content-Disposition'],
  }),
)
app.use(express.json({ limit: '200kb' }))
app.use(checkOrigin)
app.use('/api', routes)

app.use((req, res) => {
  const body: ErrorResponseDto = {
    error: { code: ErrorCode.NotFound, message: `No route ${req.method} ${req.path}`, details: null },
  }
  res.status(404).json(body)
})
app.use(errorHandler)

export default app
