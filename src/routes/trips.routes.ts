import crypto from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db/index.js'
import { authMiddleware, publicAvatarUrl } from '../middleware/auth.js'

export const tripsRouter = Router()

tripsRouter.get('/', async (_req, res, next) => {
  try {
  const db = getDb()
  const { from, to, date, filter } = _req.query

  let sql = `
    SELECT t.*, u.full_name, u.phone, u.avatar_path
    FROM trips t
    JOIN users u ON u.id = t.driver_user_id
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

tripsRouter.get('/:id', async (req, res, next) => {
  try {
  const db = getDb()
  const row = await db
    .prepare(
      `SELECT t.*, u.full_name, u.phone, u.avatar_path
       FROM trips t JOIN users u ON u.id = t.driver_user_id WHERE t.id = ?`,
    )
    .get<TripRow>(req.params.id)

  if (!row) {
    res.status(404).json({ error: 'Topilmadi' })
    return
  }
  res.json(serializeTrip(row))
  } catch (err) {
    next(err)
  }
})

tripsRouter.use(authMiddleware)

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
  note: z.string().optional(),
})

tripsRouter.post('/', async (req, res, next) => {
  try {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const db = getDb()
  const id = `trip-${crypto.randomUUID()}`
  const b = parsed.data

  await db.prepare(
    `INSERT INTO trips (
      id, driver_user_id, route_id, from_city, to_city,
      departure_date, departure_time, pickup_address,
      available_seats, price_per_seat, has_ac, has_trunk, has_wifi, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    b.note ?? null,
  )

  res.status(201).json({ id })
  } catch (err) {
    next(err)
  }
})

tripsRouter.patch('/:id/close', async (req, res, next) => {
  try {
  const db = getDb()
  await db.prepare(
    `UPDATE trips SET status = 'closed', available_seats = 0 WHERE id = ? AND driver_user_id = ?`,
  ).run(req.params.id, req.authUser!.id)
  res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

tripsRouter.patch('/:id/complete', async (req, res, next) => {
  try {
  const db = getDb()
  await db.prepare(
    `UPDATE trips SET status = 'completed', available_seats = 0 WHERE id = ? AND driver_user_id = ?`,
  ).run(req.params.id, req.authUser!.id)
  res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

interface TripRow {
  id: string
  driver_user_id: string
  route_id: string
  from_city: string
  to_city: string
  departure_date: string
  departure_time: string
  pickup_address: string
  available_seats: number
  total_seats: number
  price_per_seat: number
  has_ac: number
  has_trunk: number
  has_wifi: number
  note: string | null
  status: string
  full_name: string
  phone: string
  avatar_path: string | null
}

function serializeTrip(row: TripRow) {
  return {
    id: row.id,
    routeId: row.route_id,
    from: row.from_city,
    to: row.to_city,
    departureDate: row.departure_date,
    departureTime: row.departure_time,
    pickupAddress: row.pickup_address,
    availableSeats: row.available_seats,
    totalSeats: row.total_seats,
    pricePerSeat: row.price_per_seat,
    hasAirConditioner: Boolean(row.has_ac),
    hasLargeTrunk: Boolean(row.has_trunk),
    hasWifi: Boolean(row.has_wifi),
    note: row.note,
    status: row.status,
    driver: {
      id: row.driver_user_id,
      name: row.full_name,
      phone: row.phone,
      avatarUrl: publicAvatarUrl(row.avatar_path),
      rating: 4.9,
      tripCount: 1,
      verified: true,
    },
  }
}