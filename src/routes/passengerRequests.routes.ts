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
      .prepare(
        `SELECT * FROM passenger_requests
         WHERE COALESCE(status, 'active') = 'active'
           AND (visible_from IS NULL OR visible_from <= NOW())
           AND (visible_until IS NULL OR visible_until > NOW())
         ORDER BY created_at DESC`,
      )
      .all<PassengerRequestRow>()
    res.json(rows.map(serializePassengerRequest))
  } catch (err) {
    next(err)
  }
})

passengerRequestsRouter.use(authMiddleware)

passengerRequestsRouter.get('/mine', async (req, res, next) => {
  try {
    const db = getDb()
    const rows = await db
      .prepare(
        `SELECT * FROM passenger_requests WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all<PassengerRequestRow>(req.authUser!.id)
    res.json(rows.map(serializePassengerRequest))
  } catch (err) {
    next(err)
  }
})

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
  visibleFrom: z.string().optional(),
  visibleUntil: z.string().min(1),
})

passengerRequestsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const b = parsed.data
    const until = Date.parse(b.visibleUntil)
    if (!Number.isFinite(until) || until <= Date.now()) {
      res.status(400).json({ error: 'E’lon tugash vaqti kelajakda bo‘lishi kerak' })
      return
    }
    const fromTs = b.visibleFrom ? Date.parse(b.visibleFrom) : Date.now()
    if (!Number.isFinite(fromTs) || until <= fromTs) {
      res.status(400).json({ error: 'E’lon vaqt oralig‘i noto‘g‘ri' })
      return
    }

    const db = getDb()
    const id = `req-${crypto.randomUUID()}`
    const phone = b.phone || req.authUser!.phone
    const visibleFrom = new Date(fromTs).toISOString()
    const visibleUntil = new Date(until).toISOString()

    await db
      .prepare(
        `INSERT INTO passenger_requests (
      id, user_id, route_id, from_city, to_city, request_date,
      passenger_count, preferred_time, offered_price, phone, note,
      visible_from, visible_until, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
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
        visibleFrom,
        visibleUntil,
      )

    res.status(201).json({ id, visibleFrom, visibleUntil, status: 'active' })
  } catch (err) {
    next(err)
  }
})

const patchSchema = z.object({
  status: z.enum(['found', 'closed']),
})

passengerRequestsRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const existing = await db
      .prepare(`SELECT user_id FROM passenger_requests WHERE id = ?`)
      .get<{ user_id: string }>(req.params.id)

    if (!existing || existing.user_id !== req.authUser!.id) {
      res.status(404).json({ error: 'Talab topilmadi' })
      return
    }

    await db
      .prepare(`UPDATE passenger_requests SET status = ? WHERE id = ?`)
      .run(parsed.data.status, req.params.id)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

interface PassengerRequestRow {
  id: string
  user_id: string
  route_id: string
  from_city: string
  to_city: string
  request_date: string
  passenger_count: number
  preferred_time: string
  offered_price: number
  phone: string
  note: string | null
  created_at: string
  visible_from: string | null
  visible_until: string | null
  status: string | null
}

function serializePassengerRequest(row: PassengerRequestRow) {
  return {
    id: row.id,
    userId: row.user_id,
    from: row.from_city,
    to: row.to_city,
    routeId: row.route_id,
    date: row.request_date,
    passengerCount: row.passenger_count,
    preferredTime: row.preferred_time,
    offeredPrice: Number(row.offered_price) || 0,
    phone: row.phone,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    visibleFrom: row.visible_from ?? undefined,
    visibleUntil: row.visible_until ?? undefined,
    status: row.status ?? 'active',
  }
}
