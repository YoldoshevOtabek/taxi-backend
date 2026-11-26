import fs from 'node:fs'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from './config.js'
import { authRouter } from './routes/auth.routes.js'
import { profileRouter } from './routes/profile.routes.js'
import { tripsRouter } from './routes/trips.routes.js'
import { passengerRequestsRouter } from './routes/passengerRequests.routes.js'
import { favoritesRouter } from './routes/favorites.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { feedbackRouter } from './routes/feedback.routes.js'
import { apiIndexBody, mountSwagger, swaggerPath } from './docs/swagger.js'
import { pingDb } from './db/index.js'

export function createApp() {
  const app = express()

  fs.mkdirSync(config.uploadDir, { recursive: true })

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  )
  const corsAllow = new Set(
    config.corsOrigin
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .concat([
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:5175',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174',
        'http://127.0.0.1:5175',
      ]),
  )

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) {
          cb(null, true)
          return
        }
        if (corsAllow.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          cb(null, true)
          return
        }
        cb(null, false)
      },
      credentials: true,
    }),
  )
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'))
  app.use(express.json({ limit: '1mb' }))

  app.use(
    '/uploads/avatars',
    express.static(config.uploadDir, { maxAge: '7d' }),
  )

  mountSwagger(app)

  app.get('/', (_req, res) => {
    res.redirect(swaggerPath)
  })

  const api = express.Router()
  api.get('/', (_req, res) => {
    res.json(apiIndexBody())
  })
  api.get('/health', async (_req, res) => {
    try {
      const database = (await pingDb()) ? 'up' : 'down'
      res.json({
        ok: database === 'up',
        service: 'yol-backend',
        version: '1.0.0',
        database,
      })
    } catch {
      res.status(503).json({ ok: false, service: 'yol-backend', database: 'down' })
    }
  })
  api.use('/auth', authRouter)
  api.use('/users', profileRouter)
  api.use('/trips', tripsRouter)
  api.use('/passenger-requests', passengerRequestsRouter)
  api.use('/favorites', favoritesRouter)
  api.use('/feedback', feedbackRouter)
  api.use('/admin', adminRouter)

  app.use(config.apiPrefix, api)

  app.use(
    (
      err: Error & { code?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err.message?.includes('Faqat rasm')) {
        res.status(400).json({ error: err.message })
        return
      }
      console.error(err)
      res.status(500).json({ error: 'Server xatosi' })
    },
  )

  return app
}