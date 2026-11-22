import { initDb, closeDb } from './index.js'
import { seedDemoUser } from './seed.js'

const db = await initDb()
await seedDemoUser(db)
console.log('Demo user seeded')
await closeDb()
