import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { config } from '../config.js'

function tokensEqual(expected: string, given: string): boolean {
  if (!expected || !given) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(given)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function adminAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!config.adminApiToken) {
    res.status(503).json({ error: 'Admin API sozlanmagan (ADMIN_API_TOKEN)' })
    return
  }

  const header = req.headers.authorization ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()

  if (!tokensEqual(config.adminApiToken, token)) {
    res.status(401).json({ error: 'Admin token noto‘g‘ri' })
    return
  }

  next()
}