import { createServer } from 'node:http'
import 'dotenv/config'
import { checkConnection, closeConnection } from './db/index.js'
import app from './app.js'
import { recoverStaleJobs } from './components/services/pipeline.service.js'

const PORT = Number(process.env.PORT ?? 3001)
const httpServer = createServer(app)

const shutdown = (signal: NodeJS.Signals): void => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`)

  httpServer.close(() => {
    void closeConnection().then(() => {
      console.log('Server closed. Goodbye 👋')
      process.exit(0)
    })
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

async function main(): Promise<void> {
  console.log('Initializing backend...')

  try {
    await checkConnection()
    await recoverStaleJobs()

    httpServer.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT} 🚀`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log('Press Ctrl+C to stop the application. 🛑')
    })
  } catch (error) {
    console.error('Failed to start the application ⚠️', error)
    process.exit(1)
  }
}

void main()
