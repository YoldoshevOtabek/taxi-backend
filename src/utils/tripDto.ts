import { publicAvatarUrl } from '../middleware/auth.js'

export interface TripRow {
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
  has_roof_rack?: number
  note: string | null
  status: string
  full_name: string
  phone: string
  avatar_path: string | null
  car_model: string | null
  car_color: string | null
  plate_number: string | null
  created_at?: string
  completed_at?: string | null
}

export const TRIP_SELECT_JOIN = `
  SELECT t.*, u.full_name, u.phone, u.avatar_path,
         ds.car_model, ds.car_color, ds.plate_number
  FROM trips t
  JOIN users u ON u.id = t.driver_user_id
  LEFT JOIN driver_settings ds ON ds.user_id = u.id
`

export function serializeTrip(row: TripRow) {
  const carModel = row.car_model ?? ''
  const carColor = row.car_color ?? ''
  const plateNumber = row.plate_number ?? ''
  return {
    id: row.id,
    driverId: row.driver_user_id,
    routeId: row.route_id,
    from: row.from_city,
    to: row.to_city,
    departureDate: row.departure_date,
    departureTime: row.departure_time,
    pickupAddress: row.pickup_address,
    availableSeats: Number(row.available_seats) || 0,
    totalSeats: Number(row.total_seats) || 4,
    pricePerSeat: Number(row.price_per_seat) || 0,
    carModel,
    carColor,
    plateNumber,
    hasAirConditioner: Boolean(row.has_ac),
    hasLargeTrunk: Boolean(row.has_trunk),
    hasWifi: Boolean(row.has_wifi),
    hasRoofRack: Boolean(row.has_roof_rack),
    note: row.note,
    status: row.status,
    createdAt: row.created_at ?? new Date().toISOString(),
    completedAt: row.completed_at ?? undefined,
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

export const PUBLISH_WINDOW_MS = 24 * 60 * 60 * 1000
export const PUBLISH_LIMIT_PER_WINDOW = 2

export interface PublishStatus {
  allowed: boolean
  limit: number
  used: number
  remaining: number
  bonus: number
  bonusExpiresAt: string | null
  nextAllowedAt: string | null
}

export async function getPublishStatus(
  db: {
    prepare: (sql: string) => {
      all: <T>(...p: unknown[]) => Promise<T[]>
      get: <T>(...p: unknown[]) => Promise<T | undefined>
      run?: (...p: unknown[]) => Promise<unknown>
    }
  },
  driverUserId: string,
): Promise<PublishStatus> {
  await db
    .prepare(
      `UPDATE driver_settings
       SET publish_bonus = 0, publish_bonus_expires_at = NULL
       WHERE user_id = ?
         AND publish_bonus > 0
         AND publish_bonus_expires_at IS NOT NULL
         AND publish_bonus_expires_at < NOW()`,
    )
    .run?.(driverUserId)

  const rows = await db
    .prepare(
      `SELECT created_at FROM trips
       WHERE driver_user_id = ?
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at ASC`,
    )
    .all<{ created_at: string | Date }>(driverUserId)

  const bonusRow = await db
    .prepare(
      `SELECT publish_bonus, publish_bonus_expires_at FROM driver_settings WHERE user_id = ?`,
    )
    .get<{ publish_bonus: number; publish_bonus_expires_at: string | Date | null }>(
      driverUserId,
    )

  const used = rows.length
  const expiresAt = bonusRow?.publish_bonus_expires_at
    ? new Date(bonusRow.publish_bonus_expires_at)
    : null
  const bonusActive = Boolean(expiresAt && expiresAt.getTime() > Date.now())
  const bonus = bonusActive ? Math.max(0, Number(bonusRow?.publish_bonus ?? 0)) : 0
  const limit = PUBLISH_LIMIT_PER_WINDOW
  const remaining = Math.max(0, limit - used) + bonus
  const allowed = remaining > 0

  let nextAllowedAt: string | null = null
  if (!allowed && rows[0]?.created_at) {
    const oldest = new Date(rows[0].created_at).getTime()
    nextAllowedAt = new Date(oldest + PUBLISH_WINDOW_MS).toISOString()
  }

  return {
    allowed,
    limit,
    used,
    remaining,
    bonus,
    bonusExpiresAt: bonus > 0 && expiresAt ? expiresAt.toISOString() : null,
    nextAllowedAt,
  }
}