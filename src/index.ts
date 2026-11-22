import { createApp } from './app.js'
import { config } from './config.js'
import { initDb } from './db/index.js'
import { seedDemoUser } from './db/seed.js'

const db = await initDb()
await seedDemoUser(db)

const app = createApp()

app.listen(config.port, () => {
  console.log(`YO'L backend: ${config.publicBaseUrl}${config.apiPrefix}`)
  console.log(`Swagger: ${config.publicBaseUrl}/api/docs`)
  console.log(`Uploads: ${config.uploadDir}`)
  console.log(`Neon branch: ${process.env.NEON_BRANCH ?? 'unknown'}`)
})
