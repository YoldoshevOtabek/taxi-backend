import { initDb, closeDb, pingDb } from './index.js'

const db = await initDb()
const ok = await pingDb()
console.log(ok ? 'Neon Postgres: SELECT 1 OK, schema applied' : 'SELECT 1 failed')
await closeDb()
void db
