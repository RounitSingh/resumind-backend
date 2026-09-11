import { createServer } from 'node:http'
import 'dotenv/config'
import { checkConnection, closeConnection } from './db/index.js'
import app from './app.js'

const PORT = Number(process.env.PORT ?? 3001)
const httpServer = createServer(app)

const shutdown = async (signal) => {
  console.log(`\nReceived ${signal}, shutting down gracefully...`)

  httpServer.close(async () => {
    await closeConnection()
    console.log('Server closed. Goodbye 👋')
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

;(async () => {
  console.log('Initializing backend...')

  try {
    await checkConnection()

    httpServer.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT} 🚀`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
      console.log('Press Ctrl+C to stop the application. 🛑')
    })
  } catch (error) {
    console.error('Failed to start the application ⚠️', error)
    process.exit(1)
  }
})()
