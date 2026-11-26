import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'

export const feedbackRouter = Router()

feedbackRouter.use(authMiddleware)

const schema = z.object({
  kind: z.enum(['talab', 'taklif']),
  message: z.string().trim().min(8, 'Matn kamida 8 belgi').max(2000),
})

feedbackRouter.post('/', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Matn kamida 8 belgi bo‘lishi kerak' })
      return
    }

    const db = getDb()
    const id = `fb-${crypto.randomUUID()}`
    await db
      .prepare(
        `INSERT INTO feedback (id, user_id, kind, message, status)
         VALUES (?, ?, ?, ?, 'new')`,
      )
      .run(id, req.authUser!.id, parsed.data.kind, parsed.data.message)

    res.status(201).json({ id, ok: true })
  } catch (err) {
    next(err)
  }
})
