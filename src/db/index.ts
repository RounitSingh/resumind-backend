import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const isProduction = process.env.NODE_ENV === 'production'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000),
})

pool.on('error', (error) => {
  console.error('Unexpected error on idle database client', error)
})

export const db = drizzle(pool, { schema })

export const checkConnection = async (): Promise<void> => {
  const client = await pool.connect()
  client.release()
}

export const closeConnection = async (): Promise<void> => {
  await pool.end()
}
