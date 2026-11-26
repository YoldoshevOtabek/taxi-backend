import { Router } from 'express'
import { z } from 'zod'
import { config } from '../config.js'
import { getDb } from '../db/index.js'
import { adminAuthMiddleware } from '../middleware/adminAuth.js'
import { publicAvatarUrl } from '../middleware/auth.js'
import {
  PUBLISH_LIMIT_PER_WINDOW,
  TRIP_SELECT_JOIN,
  serializeTrip,
  type TripRow,
} from '../utils/tripDto.js'
import {
  deleteTripById,
  deleteUserCascade,
  grantPublishBonus,
  resetPublishWindow,
  userPublishSummary,
} from '../utils/adminUser.js'

export const adminRouter = Router()

adminRouter.post('/login', (req, res) => {
  const body = z
    .object({
      username: z.string().min(1),
      password: z.string().min(1),
    })
    .safeParse(req.body)

  if (!body.success) {
    res.status(400).json({ error: 'Login va parol kerak' })
    return
  }

  if (!config.adminApiToken || !config.adminPassword) {
    res.status(503).json({ error: 'Admin kirish sozlanmagan (.env)' })
    return
  }

  const { username, password } = body.data
  if (username !== config.adminUsername || password !== config.adminPassword) {
    res.status(401).json({ error: 'Login yoki parol noto‘g‘ri' })
    return
  }

  res.json({
    token: config.adminApiToken,
    tokenType: 'Bearer',
    role: 'admin',
  })
})

adminRouter.use(adminAuthMiddleware)

adminRouter.get('/overview', async (_req, res, next) => {
  try {
    const db = getDb()
    const [drivers, passengers, tripsActive, requests, feedback] = await Promise.all([
      db
        .prepare(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'driver'`)
        .get<{ c: number }>(),
      db
        .prepare(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'passenger'`)
        .get<{ c: number }>(),
      db
        .prepare(`SELECT COUNT(*)::int AS c FROM trips WHERE status = 'active'`)
        .get<{ c: number }>(),
      db
        .prepare(`SELECT COUNT(*)::int AS c FROM passenger_requests`)
        .get<{ c: number }>(),
      db.prepare(`SELECT COUNT(*)::int AS c FROM feedback`).get<{ c: number }>(),
    ])

    res.json({
      users: {
        drivers: drivers?.c ?? 0,
        passengers: passengers?.c ?? 0,
      },
      tripsActive: tripsActive?.c ?? 0,
      passengerRequests: requests?.c ?? 0,
      feedback: feedback?.c ?? 0,
    })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/users', async (req, res, next) => {
  try {
    const role = req.query.role as string | undefined
    const search = String(req.query.search ?? '').trim()
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200)
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)

    let sql = `
      SELECT u.id, u.telegram_id, u.role, u.full_name, u.phone, u.avatar_path,
             u.is_blocked, u.created_at, u.updated_at,
             ds.car_model, ds.car_color, ds.plate_number, ds.driver_mode_enabled, ds.can_publish, ds.publish_bonus, ds.publish_bonus_expires_at,
             (SELECT COUNT(*)::int FROM trips t
              WHERE t.driver_user_id = u.id
                AND t.created_at > NOW() - INTERVAL '24 hours') AS trips_24h
      FROM users u
      LEFT JOIN driver_settings ds ON ds.user_id = u.id
      WHERE u.role IS NOT NULL AND u.role IN ('driver', 'passenger')
    `
    const params: unknown[] = []

    if (role === 'driver' || role === 'passenger') {
      sql += ` AND u.role = ?`
      params.push(role)
    }
    if (search) {
      sql += ` AND (u.full_name ILIKE ? OR u.phone ILIKE ? OR u.telegram_id ILIKE ? OR u.id ILIKE ?)`
      const q = `%${search}%`
      params.push(q, q, q, q)
    }

    sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const db = getDb()
    const rows = await db.prepare(sql).all<AdminUserRow>(...params)
    res.json({ items: rows.map(serializeAdminUser), limit, offset })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/users/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const row = await db
      .prepare(
        `SELECT u.id, u.telegram_id, u.role, u.full_name, u.phone, u.avatar_path,
                u.is_blocked, u.created_at, u.updated_at,
                ds.car_model, ds.car_color, ds.plate_number, ds.driver_mode_enabled, ds.can_publish, ds.publish_bonus, ds.publish_bonus_expires_at,
                (SELECT COUNT(*)::int FROM trips t
                 WHERE t.driver_user_id = u.id
                   AND t.created_at > NOW() - INTERVAL '24 hours') AS trips_24h
         FROM users u
         LEFT JOIN driver_settings ds ON ds.user_id = u.id
         WHERE u.id = ?`,
      )
      .get<AdminUserRow>(req.params.id)

    if (!row) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi' })
      return
    }

    const tripCount = await db
      .prepare(`SELECT COUNT(*)::int AS c FROM trips WHERE driver_user_id = ?`)
      .get<{ c: number }>(req.params.id)
    const requestCount = await db
      .prepare(`SELECT COUNT(*)::int AS c FROM passenger_requests WHERE user_id = ?`)
      .get<{ c: number }>(req.params.id)
    const publish = await userPublishSummary(db, req.params.id)

    res.json({
      user: serializeAdminUser(row),
      stats: { tripCount: tripCount?.c ?? 0, requestCount: requestCount?.c ?? 0 },
      publish,
    })
  } catch (err) {
    next(err)
  }
})

const patchUserSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().min(0).max(20).optional(),
  role: z.enum(['passenger', 'driver']).nullable().optional(),
  isBlocked: z.boolean().optional(),
  carModel: z.string().max(80).optional(),
  carColor: z.string().max(40).optional(),
  plateNumber: z.string().max(20).optional(),
  driverModeEnabled: z.boolean().optional(),
  canPublish: z.boolean().optional(),
})

adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const parsed = patchUserSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const userId = req.params.id
    const exists = await db.prepare(`SELECT id FROM users WHERE id = ?`).get<{ id: string }>(userId)
    if (!exists) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi' })
      return
    }

    const d = parsed.data
  const updates: string[] = []
  const values: unknown[] = []

  if (d.fullName !== undefined) {
    updates.push(`full_name = ?`)
    values.push(d.fullName)
  }
  if (d.phone !== undefined) {
    updates.push(`phone = ?`)
    values.push(d.phone)
  }
  if (d.role !== undefined) {
    updates.push(`role = ?`)
    values.push(d.role)
  }
  if (d.isBlocked !== undefined) {
    updates.push(`is_blocked = ?`)
    values.push(d.isBlocked)
  }

  if (updates.length > 0) {
    updates.push(`updated_at = NOW()`)
    values.push(userId)
    await db
      .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
      .run(...values)
  }

    if (
      d.carModel !== undefined ||
      d.carColor !== undefined ||
      d.plateNumber !== undefined ||
      d.driverModeEnabled !== undefined ||
      d.canPublish !== undefined
    ) {
      const existing = await db
        .prepare(
          `SELECT car_model, car_color, plate_number, driver_mode_enabled, can_publish
         FROM driver_settings WHERE user_id = ?`,
        )
        .get<{
          car_model: string
          car_color: string
          plate_number: string
          driver_mode_enabled: number
          can_publish: boolean
        }>(userId)

      await db
        .prepare(
          `INSERT INTO driver_settings (
            user_id, car_model, car_color, plate_number, driver_mode_enabled, can_publish
          ) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           car_model = COALESCE(EXCLUDED.car_model, driver_settings.car_model),
           car_color = COALESCE(EXCLUDED.car_color, driver_settings.car_color),
           plate_number = COALESCE(EXCLUDED.plate_number, driver_settings.plate_number),
           driver_mode_enabled = COALESCE(EXCLUDED.driver_mode_enabled, driver_settings.driver_mode_enabled),
           can_publish = COALESCE(EXCLUDED.can_publish, driver_settings.can_publish)`,
        )
        .run(
          userId,
          d.carModel ?? existing?.car_model ?? '',
          d.carColor ?? existing?.car_color ?? '',
          d.plateNumber ?? existing?.plate_number ?? '',
          d.driverModeEnabled === undefined
            ? (existing?.driver_mode_enabled ?? 1)
            : d.driverModeEnabled
              ? 1
              : 0,
          d.canPublish === undefined
            ? (existing?.can_publish ?? true)
            : d.canPublish,
        )
    }

    const row = await db
      .prepare(
        `SELECT u.id, u.telegram_id, u.role, u.full_name, u.phone, u.avatar_path,
                u.is_blocked, u.created_at, u.updated_at,
                ds.car_model, ds.car_color, ds.plate_number, ds.driver_mode_enabled, ds.can_publish, ds.publish_bonus, ds.publish_bonus_expires_at,
                (SELECT COUNT(*)::int FROM trips t
                 WHERE t.driver_user_id = u.id
                   AND t.created_at > NOW() - INTERVAL '24 hours') AS trips_24h
         FROM users u
         LEFT JOIN driver_settings ds ON ds.user_id = u.id
         WHERE u.id = ?`,
      )
      .get<AdminUserRow>(userId)

    res.json({ user: row ? serializeAdminUser(row) : null })
  } catch (err) {
    next(err)
  }
})

adminRouter.delete('/users/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const exists = await db
      .prepare(`SELECT id FROM users WHERE id = ?`)
      .get<{ id: string }>(req.params.id)
    if (!exists) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi' })
      return
    }
    await deleteUserCascade(db, req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/users/:id/grant-publish-bonus', async (req, res, next) => {
  try {
    const db = getDb()
    const exists = await db
      .prepare(`SELECT id, role FROM users WHERE id = ?`)
      .get<{ id: string; role: string | null }>(req.params.id)
    if (!exists) {
      res.status(404).json({ error: 'Foydalanuvchi topilmadi' })
      return
    }
    const bonus = await grantPublishBonus(db, req.params.id, 1)
    const publish = await userPublishSummary(db, req.params.id)
    res.json({ ok: true, bonus, publish })
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/users/:id/reset-publish', async (req, res, next) => {
  try {
    const db = getDb()
    const removed = await resetPublishWindow(db, req.params.id)
  const publish = await userPublishSummary(db, req.params.id)
    res.json({ ok: true, removedTrips: removed, publish })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/users/:id/publish-status', async (req, res, next) => {
  try {
    const db = getDb()
    const publish = await userPublishSummary(db, req.params.id)
    res.json(publish)
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/trips', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200)
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)

    let sql = `${TRIP_SELECT_JOIN} WHERE 1=1`
    const params: unknown[] = []

    if (status) {
      sql += ` AND t.status = ?`
      params.push(status)
    }
    sql += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const db = getDb()
    const rows = await db.prepare(sql).all<TripRow>(...params)
    res.json({ items: rows.map(serializeTrip), limit, offset })
  } catch (err) {
    next(err)
  }
})

const patchTripSchema = z.object({
  status: z.enum(['active', 'closed', 'completed']).optional(),
  availableSeats: z.number().int().min(0).max(4).optional(),
})

adminRouter.patch('/trips/:id', async (req, res, next) => {
  try {
    const parsed = patchTripSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const d = parsed.data
    const sets: string[] = []
    const vals: unknown[] = []

    if (d.status) {
      sets.push(`status = ?`)
      vals.push(d.status)
      if (d.status === 'completed' || d.status === 'closed') {
        sets.push(`completed_at = COALESCE(completed_at, NOW())`)
      }
    }
    if (d.availableSeats !== undefined) {
      sets.push(`available_seats = ?`)
      vals.push(d.availableSeats)
    }

    if (sets.length === 0) {
      res.status(400).json({ error: 'Yangilash maydoni yo‘q' })
      return
    }

    vals.push(req.params.id)
    await db.prepare(`UPDATE trips SET ${sets.join(', ')} WHERE id = ?`).run(...vals)

    const row = await db
      .prepare(`${TRIP_SELECT_JOIN} WHERE t.id = ?`)
      .get<TripRow>(req.params.id)

    if (!row) {
      res.status(404).json({ error: 'Safar topilmadi' })
      return
    }
    res.json({ trip: serializeTrip(row) })
  } catch (err) {
    next(err)
  }
})

adminRouter.delete('/trips/:id', async (req, res, next) => {
  try {
    const db = getDb()
    const row = await db
      .prepare(`SELECT id FROM trips WHERE id = ?`)
      .get<{ id: string }>(req.params.id)
    if (!row) {
      res.status(404).json({ error: 'E’lon topilmadi' })
      return
    }
    await deleteTripById(db, req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/passenger-requests', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200)
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)
    const db = getDb()
    const rows = await db
      .prepare(
        `SELECT pr.*, u.full_name AS user_full_name, u.role AS user_role
         FROM passenger_requests pr
         JOIN users u ON u.id = pr.user_id
         ORDER BY pr.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all<PassengerRequestAdminRow>(limit, offset)

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userFullName: r.user_full_name,
        userRole: r.user_role,
        from: r.from_city,
        to: r.to_city,
        routeId: r.route_id,
        date: r.request_date,
        passengerCount: r.passenger_count,
        preferredTime: r.preferred_time,
        offeredPrice: r.offered_price,
        phone: r.phone,
        note: r.note,
        createdAt: r.created_at,
        visibleFrom: r.visible_from,
        visibleUntil: r.visible_until,
        status: r.status ?? 'active',
      })),
      limit,
      offset,
    })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/feedback', async (req, res, next) => {
  try {
    const kind = req.query.kind as string | undefined
    const status = req.query.status as string | undefined
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 200)
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0)

    let sql = `
      SELECT f.id, f.user_id, f.kind, f.message, f.status, f.created_at,
             u.full_name AS user_full_name, u.role AS user_role, u.phone AS user_phone
      FROM feedback f
      JOIN users u ON u.id = f.user_id
      WHERE 1=1
    `
    const params: unknown[] = []
    if (kind === 'talab' || kind === 'taklif') {
      sql += ` AND f.kind = ?`
      params.push(kind)
    }
    if (status === 'new' || status === 'read' || status === 'done') {
      sql += ` AND f.status = ?`
      params.push(status)
    }
    sql += ` ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const db = getDb()
    const rows = await db.prepare(sql).all<FeedbackAdminRow>(...params)
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        userId: r.user_id,
        userFullName: r.user_full_name,
        userRole: r.user_role,
        userPhone: r.user_phone,
        kind: r.kind,
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
      })),
      limit,
      offset,
    })
  } catch (err) {
    next(err)
  }
})

adminRouter.patch('/feedback/:id', async (req, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(['new', 'read', 'done']) })
      .safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'Holat noto‘g‘ri' })
      return
    }
    const db = getDb()
    const existing = await db
      .prepare(`SELECT id FROM feedback WHERE id = ?`)
      .get<{ id: string }>(req.params.id)
    if (!existing) {
      res.status(404).json({ error: 'Yozuv topilmadi' })
      return
    }
    await db
      .prepare(`UPDATE feedback SET status = ? WHERE id = ?`)
      .run(body.data.status, req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

adminRouter.delete('/feedback/:id', async (req, res, next) => {
  try {
    const db = getDb()
    await db.prepare(`DELETE FROM feedback WHERE id = ?`).run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

adminRouter.delete('/passenger-requests/:id', async (req, res, next) => {
  try {
    const db = getDb()
    await db.prepare(`DELETE FROM passenger_requests WHERE id = ?`).run(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

interface AdminUserRow {
  id: string
  telegram_id: string | null
  role: string | null
  full_name: string
  phone: string
  avatar_path: string | null
  is_blocked: boolean
  created_at: string
  updated_at: string
  car_model: string | null
  car_color: string | null
  plate_number: string | null
  driver_mode_enabled: number | null
  can_publish: boolean | null
  publish_bonus: number | null
  publish_bonus_expires_at: string | Date | null
  trips_24h: number
}

interface FeedbackAdminRow {
  id: string
  user_id: string
  kind: string
  message: string
  status: string
  created_at: string
  user_full_name: string
  user_role: string | null
  user_phone: string | null
}

interface PassengerRequestAdminRow {
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
  user_full_name: string
  user_role: string | null
}

function serializeAdminUser(row: AdminUserRow) {
  const hasDriver =
    row.role === 'driver' ||
    Boolean(row.car_model || row.car_color || row.plate_number)
  const used = Number(row.trips_24h ?? 0)
  const bonusExpires = row.publish_bonus_expires_at
    ? new Date(row.publish_bonus_expires_at).getTime()
    : 0
  const bonus =
    bonusExpires > Date.now() ? Math.max(0, Number(row.publish_bonus ?? 0)) : 0
  const canPublish = row.can_publish == null ? true : Boolean(row.can_publish)
  const remaining = Math.max(0, PUBLISH_LIMIT_PER_WINDOW - used) + bonus

  return {
    id: row.id,
    telegramId: row.telegram_id,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    avatarUrl: publicAvatarUrl(row.avatar_path),
    isBlocked: Boolean(row.is_blocked),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    canPublish,
    publishWindow: {
      used,
      limit: PUBLISH_LIMIT_PER_WINDOW,
      bonus,
      remaining,
      allowed: remaining > 0 && canPublish,
      bonusExpiresAt:
        bonus > 0 && row.publish_bonus_expires_at
          ? new Date(row.publish_bonus_expires_at).toISOString()
          : null,
    },
    driver: hasDriver
      ? {
          carModel: row.car_model ?? '',
          carColor: row.car_color ?? '',
          plateNumber: row.plate_number ?? '',
          driverModeEnabled: Boolean(Number(row.driver_mode_enabled ?? 1)),
          canPublish,
        }
      : null,
  }
}