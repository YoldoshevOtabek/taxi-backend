import fs from 'node:fs'
import { Router } from 'express'
import { z } from 'zod'
import { getDb } from '../db/index.js'
import { authMiddleware, publicAvatarUrl } from '../middleware/auth.js'
import { avatarUpload } from '../middleware/upload.js'

export const profileRouter = Router()

profileRouter.use(authMiddleware)

profileRouter.get('/me', async (req, res, next) => {
  try {
    const db = getDb()
    const row = await db
      .prepare(
        `SELECT id, role, full_name, phone, avatar_path, telegram_id FROM users WHERE id = ?`,
      )
      .get<UserRow>(req.authUser!.id)

    if (!row) {
      res.status(404).json({ error: 'Profil topilmadi' })
      return
    }

    const driver = await db
      .prepare(
        `SELECT car_model, car_color, plate_number, driver_mode_enabled
       FROM driver_settings WHERE user_id = ?`,
      )
      .get<DriverRow>(req.authUser!.id)

    res.json({
      user: {
        id: row.id,
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
        avatarUrl: publicAvatarUrl(row.avatar_path),
        telegramId: row.telegram_id,
      },
      driver: driver
        ? {
            carModel: driver.car_model,
            carColor: driver.car_color,
            plateNumber: driver.plate_number,
            driverModeEnabled: Boolean(Number(driver.driver_mode_enabled)),
          }
        : null,
    })
  } catch (err) {
    next(err)
  }
})

const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  phone: z.string().min(9).max(20).optional(),
  role: z.enum(['passenger', 'driver']).optional(),
})

profileRouter.patch('/me', async (req, res, next) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const { fullName, phone, role } = parsed.data
    const db = getDb()
    const userId = req.authUser!.id

    if (fullName !== undefined) {
      await db
        .prepare(`UPDATE users SET full_name = ?, updated_at = NOW() WHERE id = ?`)
        .run(fullName, userId)
    }
    if (phone !== undefined) {
      await db
        .prepare(`UPDATE users SET phone = ?, updated_at = NOW() WHERE id = ?`)
        .run(phone, userId)
    }
    if (role !== undefined) {
      await db
        .prepare(`UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?`)
        .run(role, userId)
    }

    const row = await db
      .prepare(`SELECT id, role, full_name, phone, avatar_path FROM users WHERE id = ?`)
      .get<UserRow>(userId)

    if (!row) {
      res.status(404).json({ error: 'Profil topilmadi' })
      return
    }

    res.json({
      user: {
        id: row.id,
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
        avatarUrl: publicAvatarUrl(row.avatar_path),
      },
    })
  } catch (err) {
    next(err)
  }
})

profileRouter.post('/me/avatar', avatarUpload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Rasm fayli yuborilmagan' })
      return
    }

    const db = getDb()
    const userId = req.authUser!.id
    const prev = await db
      .prepare(`SELECT avatar_path FROM users WHERE id = ?`)
      .get<{ avatar_path: string | null }>(userId)

    if (prev?.avatar_path && fs.existsSync(prev.avatar_path)) {
      fs.unlinkSync(prev.avatar_path)
    }

    await db
      .prepare(`UPDATE users SET avatar_path = ?, updated_at = NOW() WHERE id = ?`)
      .run(req.file.path, userId)

    res.json({
      avatarUrl: publicAvatarUrl(req.file.path),
    })
  } catch (err) {
    next(err)
  }
})

profileRouter.delete('/me/avatar', async (req, res, next) => {
  try {
    const db = getDb()
    const userId = req.authUser!.id
    const prev = await db
      .prepare(`SELECT avatar_path FROM users WHERE id = ?`)
      .get<{ avatar_path: string | null }>(userId)

    if (prev?.avatar_path && fs.existsSync(prev.avatar_path)) {
      fs.unlinkSync(prev.avatar_path)
    }

    await db
      .prepare(`UPDATE users SET avatar_path = NULL, updated_at = NOW() WHERE id = ?`)
      .run(userId)

    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

const driverSchema = z.object({
  carModel: z.string().min(2),
  carColor: z.string().min(2),
  plateNumber: z.string().min(5),
  driverModeEnabled: z.boolean().optional(),
  fullName: z.string().min(2).optional(),
  phone: z.string().min(9).optional(),
})

profileRouter.put('/me/driver', async (req, res, next) => {
  try {
    const parsed = driverSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const userId = req.authUser!.id
    const d = parsed.data

    if (d.fullName) {
      await db.prepare(`UPDATE users SET full_name = ? WHERE id = ?`).run(d.fullName, userId)
    }
    if (d.phone) {
      await db.prepare(`UPDATE users SET phone = ? WHERE id = ?`).run(d.phone, userId)
    }

    await db
      .prepare(
        `INSERT INTO driver_settings (user_id, car_model, car_color, plate_number, driver_mode_enabled)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       car_model = EXCLUDED.car_model,
       car_color = EXCLUDED.car_color,
       plate_number = EXCLUDED.plate_number,
       driver_mode_enabled = COALESCE(EXCLUDED.driver_mode_enabled, driver_settings.driver_mode_enabled)`,
      )
      .run(
        userId,
        d.carModel,
        d.carColor,
        d.plateNumber,
        d.driverModeEnabled === undefined ? 1 : d.driverModeEnabled ? 1 : 0,
      )

    await db.prepare(`UPDATE users SET role = 'driver' WHERE id = ?`).run(userId)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

const passengerSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(9),
})

profileRouter.put('/me/passenger', async (req, res, next) => {
  try {
    const parsed = passengerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const db = getDb()
    const userId = req.authUser!.id

    await db
      .prepare(
        `UPDATE users SET full_name = ?, phone = ?, role = 'passenger', updated_at = NOW() WHERE id = ?`,
      )
      .run(parsed.data.fullName, parsed.data.phone, userId)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

interface UserRow {
  id: string
  role: string | null
  full_name: string
  phone: string
  avatar_path: string | null
  telegram_id?: string
}

interface DriverRow {
  car_model: string
  car_color: string
  plate_number: string
  driver_mode_enabled: number
}
