import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'

export const passengerRequestsRouter = Router()

passengerRequestsRouter.get('/', async (_req, res, next) => {
  try {
    const db = getDb()
    const rows = await db
      .prepare(`SELECT * FROM passenger_requests ORDER BY created_at DESC`)
      .all()
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

passengerRequestsRouter.use(authMiddleware)

const schema = z.object({
  routeId: z.string(),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  passengerCount: z.number().int().min(1).max(6),
  preferredTime: z.string(),
  offeredPrice: z.number().positive(),
  phone: z.string().optional(),
  note: z.string().optional(),
})

passengerRequestsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const b = parsed.data
    const db = getDb()
    const id = `req-${crypto.randomUUID()}`
    const phone = b.phone || req.authUser!.phone

    await db
      .prepare(
        `INSERT INTO passenger_requests (
      id, user_id, route_id, from_city, to_city, request_date,
      passenger_count, preferred_time, offered_price, phone, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        req.authUser!.id,
        b.routeId,
        b.from,
        b.to,
        b.date,
        b.passengerCount,
        b.preferredTime,
        b.offeredPrice,
        phone,
        b.note ?? null,
      )

    res.status(201).json({ id })
  } catch (err) {
    next(err)
  }
})
