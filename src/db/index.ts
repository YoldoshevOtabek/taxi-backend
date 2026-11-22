import pg from 'pg'
import { config } from '../config.js'
import { SqlClient } from './client.js'
import { migrate } from './schema.js'

let pool: pg.Pool | null = null
let client: SqlClient | null = null

function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: true },
    max: 10,
  })
}

export async function initDb(): Promise<SqlClient> {
  if (client) return client

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL topilmadi. Neon: neon env pull yoki neon deploy')
  }

  const migratePool = createPool(config.databaseUrlUnpooled || config.databaseUrl)
  const migrateClient = new SqlClient(migratePool)
  try {
    await migrate(migrateClient)
  } finally {
    await migratePool.end()
  }

  pool = createPool(config.databaseUrl)
  client = new SqlClient(pool)
  return client
}

export function getDb(): SqlClient {
  if (!client) {
    throw new Error('initDb() avval chaqirilishi kerak')
  }
  return client
}

export function getPool(): pg.Pool {
  if (!pool) {
    throw new Error('initDb() avval chaqirilishi kerak')
  }
  return pool
}

export async function pingDb(): Promise<boolean> {
  const result = await getPool().query('SELECT 1 AS ok')
  return Number(result.rows[0]?.ok) === 1
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    client = null
  }
}

export type AppDatabase = SqlClient
