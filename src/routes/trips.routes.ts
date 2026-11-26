import crypto from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { getDb } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'
import {
  getPublishStatus,
  serializeTrip,
  TRIP_SELECT_JOIN,
  type TripRow,
} from '../utils/tripDto.js'
import {
  consumePublishBonusIfNeeded,
  userCanPublishTrips,
  userPublishSummary,
} from '../utils/adminUser.js'
import { runLifecycle } from '../jobs/lifecycle.js'

export const tripsRouter = Router()

tripsRouter.get('/', async (_req, res, next) => {
  try {
  await runLifecycle()
  const db = getDb()
  const { from, to, date, filter } = _req.query

  let sql = `
    ${TRIP_SELECT_JOIN}
    WHERE t.status = 'active' AND t.available_seats > 0
  `
  const params: string[] = []

  if (from) {
    sql += ` AND t.from_city = ?`
    params.push(String(from))
  }
  if (to) {
    sql += ` AND t.to_city = ?`
    params.push(String(to))
  }
  if (date) {
    sql += ` AND t.departure_date = ?`
    params.push(String(date))
  }
  const passengers = _req.query.passengers
  if (passengers) {
    sql += ` AND t.available_seats >= ?`
    params.push(String(passengers))
  }

  if (filter === 'cheapest') sql += ` ORDER BY t.price_per_seat ASC`
  else if (filter === 'earliest') sql += ` ORDER BY t.departure_date, t.departure_time`
  else if (filter === 'most_seats') sql += ` ORDER BY t.available_seats DESC`
  else sql += ` ORDER BY t.created_at DESC`

  const rows = await db.prepare(sql).all<TripRow>(...params)
  res.json(rows.map(serializeTrip))
  } catch (err) {
    next(err)
  }
})

tripsRouter.get('/mine', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb()
    const rows = await db
      .prepare(
        `${TRIP_SELECT_JOIN}
         WHERE t.driver_user_id = ?
         ORDER BY t.created_at DESC`,
      )
      .all<TripRow>(req.authUser!.id)
    res.json(rows.map(serializeTrip))
  } catch (err) {
    next(err)
  }
})

tripsRouter.get('/publish-status', authMiddleware, async (req, res, next) => {
  try {
    const db = getDb()
    const status = await userPublishSummary(db, req.authUser!.id)
    res.json(status)
  } catch (err) {
    next(err)
  }
})

function tripIdParam(req: Request): string {
  const id = req.params.id
  return Array.isArray(id) ? String(id[0] ?? '') : String(id ?? '')
}

const createSchema = z.object({
  routeId: z.string(),
  from: z.string(),
  to: z.string(),
  departureDate: z.string(),
  departureTime: z.string(),
  pickupAddress: z.string(),
  availableSeats: z.number().int().min(1).max(4),
  pricePerSeat: z.number().positive(),
  hasAirConditioner: z.boolean().optional(),
  hasLargeTrunk: z.boolean().optional(),
  hasWifi: z.boolean().optional(),
  hasRoofRack: z.boolean().optional(),
  note: z.string().optional(),
})

tripsRouter.post('/', authMiddleware, async (req, res, next) => {
  try {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const db = getDb()
  if (!(await userCanPublishTrips(db, req.authUser!.id))) {
    res.status(403).json({ error: 'E’lon berish admin tomonidan taqiqlangan' })
    return
  }
  const publishStatus = await getPublishStatus(db, req.authUser!.id)
  if (!publishStatus.allowed) {
    res.status(429).json({
      error: '24 soat ichida maksimal 2 ta e’lon joylashtirish mumkin',
      ...publishStatus,
    })
    return
  }
  const usedBeforeCreate = publishStatus.used

  const id = `trip-${crypto.randomUUID()}`
  const b = parsed.data

  await db.prepare(
    `INSERT INTO trips (
      id, driver_user_id, route_id, from_city, to_city,
      departure_date, departure_time, pickup_address,
      available_seats, price_per_seat, has_ac, has_trunk, has_wifi, has_roof_rack, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    req.authUser!.id,
    b.routeId,
    b.from,
    b.to,
    b.departureDate,
    b.departureTime,
    b.pickupAddress,
    b.availableSeats,
    b.pricePerSeat,
    b.hasAirConditioner ? 1 : 0,
    b.hasLargeTrunk ? 1 : 0,
    b.hasWifi ? 1 : 0,
    b.hasRoofRack ? 1 : 0,
    b.note ?? null,
  )

  await consumePublishBonusIfNeeded(db, req.authUser!.id, usedBeforeCreate)

  res.status(201).json({ id })
  } catch (err) {
    next(err)
  }
})

async function updateTripHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const tripId = tripIdParam(req)
    const existing = await db
      .prepare(`SELECT id, driver_user_id, status FROM trips WHERE id = ?`)
      .get<{ id: string; driver_user_id: string; status: string }>(tripId)

    if (!existing) {
      res.status(404).json({ error: 'E’lon topilmadi' })
      return
    }
    if (existing.driver_user_id !== req.authUser!.id) {
      res.status(403).json({ error: 'Faqat o‘z e’loningizni tahrirlashingiz mumkin' })
      return
    }
    if (existing.status !== 'active') {
      res.status(400).json({ error: 'Faqat faol e’lonni tahrirlash mumkin' })
      return
    }

    const b = parsed.data
    await db
      .prepare(
        `UPDATE trips SET
          route_id = ?, from_city = ?, to_city = ?,
          departure_date = ?, departure_time = ?, pickup_address = ?,
          available_seats = ?, price_per_seat = ?,
          has_ac = ?, has_trunk = ?, has_wifi = ?, has_roof_rack = ?, note = ?
         WHERE id = ? AND driver_user_id = ?`,
      )
      .run(
        b.routeId,
        b.from,
        b.to,
        b.departureDate,
        b.departureTime,
        b.pickupAddress,
        b.availableSeats,
        b.pricePerSeat,
        b.hasAirConditioner ? 1 : 0,
        b.hasLargeTrunk ? 1 : 0,
        b.hasWifi ? 1 : 0,
        b.hasRoofRack ? 1 : 0,
        b.note ?? null,
        tripId,
        req.authUser!.id,
      )

    const row = await db
      .prepare(`${TRIP_SELECT_JOIN} WHERE t.id = ?`)
      .get<TripRow>(tripId)
    res.json(row ? serializeTrip(row) : { id: tripId })
  } catch (err) {
    next(err)
  }
}

tripsRouter.patch('/:id/close', authMiddleware, async (req, res, next) => {
  try {
  const db = getDb()
  await db.prepare(
    `UPDATE trips SET status = 'closed', available_seats = 0, completed_at = COALESCE(completed_at, NOW()) WHERE id = ? AND driver_user_id = ?`,
  ).run(tripIdParam(req), req.authUser!.id)
  res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

tripsRouter.patch('/:id/complete', authMiddleware, async (req, res, next) => {
  try {
  const db = getDb()
  await db.prepare(
    `UPDATE trips SET status = 'completed', available_seats = 0, completed_at = COALESCE(completed_at, NOW()) WHERE id = ? AND driver_user_id = ?`,
  ).run(tripIdParam(req), req.authUser!.id)
  res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

tripsRouter.patch('/:id', authMiddleware, updateTripHandler)

tripsRouter.get('/:id', async (req, res, next) => {
  try {
  const db = getDb()
  const row = await db
    .prepare(`${TRIP_SELECT_JOIN} WHERE t.id = ?`)
    .get<TripRow>(tripIdParam(req))

  if (!row) {
    res.status(404).json({ error: 'Topilmadi' })
    return
  }
  res.json(serializeTrip(row))
  } catch (err) {
    next(err)
  }
})