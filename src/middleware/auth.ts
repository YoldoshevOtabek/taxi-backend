import type { NextFunction, Request, Response } from 'express'
import { getDb } from '../db/index.js'
import { validateInitData } from '../utils/telegramAuth.js'
import { config } from '../config.js'

export interface AuthUser {
  id: string
  telegramId: string | null
  role: 'passenger' | 'driver' | null
  fullName: string
  phone: string
  avatarPath: string | null
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const initData = req.headers.authorization?.replace(/^tma\s+/i, '')?.trim()
    const demoUserId = req.headers['x-demo-user-id']
    const db = getDb()

    if (demoUserId && typeof demoUserId === 'string' && config.allowDemoUser) {
      const row = await db
        .prepare(
          `SELECT id, telegram_id, role, full_name, phone, avatar_path, is_blocked FROM users WHERE id = ?`,
        )
        .get<AuthUserRow>(demoUserId)

      if (row) {
        if (isBlocked(row)) {
          res.status(403).json({ error: 'Hisob bloklangan' })
          return
        }
        req.authUser = mapRow(row)
        next()
        return
      }
    }

    if (!initData) {
      res.status(401).json({ error: 'Autentifikatsiya talab qilinadi' })
      return
    }

    const parsed = validateInitData(initData)
    if (!parsed.valid || !parsed.user) {
      res.status(401).json({ error: 'Telegram initData noto‘g‘ri' })
      return
    }

    const telegramId = String(parsed.user.id)
    let row = await db
      .prepare(
        `SELECT id, telegram_id, role, full_name, phone, avatar_path, is_blocked FROM users WHERE telegram_id = ?`,
      )
      .get<AuthUserRow>(telegramId)

    if (!row) {
      const id = `tg-${telegramId}`
      const fullName = [parsed.user.first_name, parsed.user.last_name]
        .filter(Boolean)
        .join(' ')
      await db
        .prepare(`INSERT INTO users (id, telegram_id, full_name) VALUES (?, ?, ?)`)
        .run(id, telegramId, fullName)
      row = await db
        .prepare(
          `SELECT id, telegram_id, role, full_name, phone, avatar_path, is_blocked FROM users WHERE id = ?`,
        )
        .get<AuthUserRow>(id)
    }

    if (!row) {
      res.status(500).json({ error: 'Foydalanuvchi yaratilmadi' })
      return
    }

    if (isBlocked(row)) {
      res.status(403).json({ error: 'Hisob bloklangan' })
      return
    }

    req.authUser = mapRow(row)
    next()
  } catch (err) {
    next(err)
  }
}

interface AuthUserRow {
  id: string
  telegram_id: string | null
  role: string | null
  full_name: string
  phone: string
  avatar_path: string | null
  is_blocked?: boolean | number
}

function isBlocked(row: AuthUserRow): boolean {
  return Boolean(row.is_blocked)
}

function mapRow(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    telegramId: row.telegram_id,
    role: row.role as AuthUser['role'],
    fullName: row.full_name,
    phone: row.phone,
    avatarPath: row.avatar_path,
  }
}

export function publicAvatarUrl(avatarPath: string | null): string | null {
  if (!avatarPath) return null
  const name = avatarPath.split(/[/\\]/).pop()
  if (!name) return null
  return `${config.publicBaseUrl}/uploads/avatars/${name}`
}
