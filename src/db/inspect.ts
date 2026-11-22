import { initDb, closeDb } from './index.js'

const db = await initDb()
const tables = await db
  .prepare(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  )
  .all<{ table_name: string }>()
console.log('tables:', tables.map((r) => r.table_name).join(', '))
const demo = await db
  .prepare(`SELECT id, role FROM users WHERE id = ?`)
  .get<{ id: string; role: string }>('demo-user')
console.log('demo-user:', demo ? `${demo.id} (${demo.role})` : 'missing — seed on server start')
await closeDb()
