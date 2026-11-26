import { createApp } from './app.js'
import { config } from './config.js'
import { initDb } from './db/index.js'
import { seedDemoUser } from './db/seed.js'

const db = await initDb()
await seedDemoUser(db)

const app = createApp()

app.listen(config.port, '0.0.0.0', () => {
  console.log(`HamrohTaxi backend: ${config.publicBaseUrl}${config.apiPrefix}`)
  console.log(`Swagger: ${config.publicBaseUrl}/api/docs`)
  console.log(`Uploads: ${config.uploadDir}`)
  console.log(`CORS: ${config.corsOrigin}`)
  console.log(
    config.adminApiToken && config.adminPassword
      ? `Admin: ${config.adminUsername} (login /admin/login)`
      : 'Admin: sozlanmagan — .env da ADMIN_PASSWORD va ADMIN_API_TOKEN',
  )
  console.log(`Neon branch: ${process.env.NEON_BRANCH ?? 'unknown'}`)
})
