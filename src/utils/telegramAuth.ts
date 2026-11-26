import crypto from 'node:crypto'
import { config } from '../config.js'

export interface TelegramInitUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

export function validateInitData(initData: string): {
  valid: boolean
  user?: TelegramInitUser
  authDate?: number
} {
  if (!initData) return { valid: false }

  if (!config.botToken && config.nodeEnv === 'development') {
    return parseInitDataUnsafe(initData)
  }

  if (!config.botToken) return { valid: false }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return { valid: false }

  params.delete('hash')
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(config.botToken)
    .digest()

  const calculated = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (calculated !== hash) {
    if (config.nodeEnv === 'development') {
      return parseInitDataUnsafe(initData)
    }
    return { valid: false }
  }

  return parseInitDataUnsafe(initData)
}

function parseInitDataUnsafe(initData: string): {
  valid: boolean
  user?: TelegramInitUser
  authDate?: number
} {
  try {
    const params = new URLSearchParams(initData)
    const userRaw = params.get('user')
    const authDate = Number(params.get('auth_date') ?? 0)
    if (!userRaw) return { valid: false }
    const user = JSON.parse(userRaw) as TelegramInitUser
    return { valid: true, user, authDate }
  } catch {
    return { valid: false }
  }
}