import { Router } from 'express'
import { getDb } from '../db/index.js'
import { validateInitData } from '../utils/telegramAuth.js'
import { publicAvatarUrl } from '../middleware/auth.js'

export const authRouter = Router()

authRouter.post('/telegram', async (req, res, next) => {
  try {
    const initData = typeof req.body?.initData === 'string' ? req.body.initData : ''
    const role = req.body?.role as 'passenger' | 'driver' | undefined

    const parsed = validateInitData(initData)
    if (!parsed.valid || !parsed.user) {
      res.status(401).json({ error: 'Telegram imzosi noto‘g‘ri' })
      return
    }

    const telegramId = String(parsed.user.id)
    const db = getDb()
    const fullName = [parsed.user.first_name, parsed.user.last_name]
      .filter(Boolean)
      .join(' ')

    const existing = await db
      .prepare(`SELECT id FROM users WHERE telegram_id = ?`)
      .get<{ id: string }>(telegramId)

    let userId: string
    if (existing) {
      userId = existing.id
      await db
        .prepare(
          `UPDATE users SET full_name = ?, role = COALESCE(?, role), updated_at = NOW() WHERE id = ?`,
        )
        .run(fullName, role ?? null, userId)
    } else {
      userId = `tg-${telegramId}`
      await db
        .prepare(
          `INSERT INTO users (id, telegram_id, role, full_name) VALUES (?, ?, ?, ?)`,
        )
        .run(userId, telegramId, role ?? null, fullName)
    }

    const user = await db
      .prepare(
        `SELECT id, role, full_name, phone, avatar_path, telegram_id FROM users WHERE id = ?`,
      )
      .get<UserRow>(userId)

    if (!user) {
      res.status(500).json({ error: 'Foydalanuvchi topilmadi' })
      return
    }

    res.json({
      user: serializeUser(user),
      initDataAccepted: true,
    })
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
  telegram_id: string
}

function serializeUser(row: UserRow) {
  return {
    id: row.id,
    role: row.role,
    fullName: row.full_name,
    phone: row.phone,
    avatarUrl: publicAvatarUrl(row.avatar_path),
    telegramId: row.telegram_id,
  }
}
