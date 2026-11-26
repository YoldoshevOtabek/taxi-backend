import type { SqlClient } from '../db/client.js'
import { PUBLISH_LIMIT_PER_WINDOW, getPublishStatus } from './tripDto.js'

export async function deleteTripById(db: SqlClient, tripId: string): Promise<void> {
  await db.prepare(`DELETE FROM favorites WHERE trip_id = ?`).run(tripId)
  await db.prepare(`DELETE FROM trips WHERE id = ?`).run(tripId)
}

export async function deleteUserCascade(db: SqlClient, userId: string): Promise<void> {
  const trips = await db
    .prepare(`SELECT id FROM trips WHERE driver_user_id = ?`)
    .all<{ id: string }>(userId)
  for (const t of trips) {
    await deleteTripById(db, t.id)
  }
  await db.prepare(`DELETE FROM favorites WHERE user_id = ?`).run(userId)
  await db.prepare(`DELETE FROM passenger_requests WHERE user_id = ?`).run(userId)
  await db.prepare(`DELETE FROM feedback WHERE user_id = ?`).run(userId)
  await db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
}

export async function grantPublishBonus(db: SqlClient, userId: string, amount = 1): Promise<number> {
  const existing = await db
    .prepare(`SELECT publish_bonus FROM driver_settings WHERE user_id = ?`)
    .get<{ publish_bonus: number }>(userId)

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO driver_settings (
          user_id, car_model, car_color, plate_number, driver_mode_enabled, can_publish, publish_bonus, publish_bonus_expires_at
        ) VALUES (?, '', '', '', 1, TRUE, ?, NOW() + INTERVAL '24 hours')`,
      )
      .run(userId, amount)
    return amount
  }

  await db
    .prepare(
      `UPDATE driver_settings
       SET publish_bonus = publish_bonus + ?,
           publish_bonus_expires_at = NOW() + INTERVAL '24 hours'
       WHERE user_id = ?`,
    )
    .run(amount, userId)

  return Number(existing.publish_bonus) + amount
}

export async function consumePublishBonusIfNeeded(
  db: SqlClient,
  userId: string,
  usedBeforeCreate: number,
): Promise<void> {
  if (usedBeforeCreate < PUBLISH_LIMIT_PER_WINDOW) return
  await db
    .prepare(
      `UPDATE driver_settings
       SET publish_bonus = GREATEST(publish_bonus - 1, 0)
       WHERE user_id = ? AND publish_bonus > 0`,
    )
    .run(userId)
}

export async function resetPublishWindow(db: SqlClient, userId: string): Promise<number> {
  const trips = await db
    .prepare(
      `SELECT id FROM trips
       WHERE driver_user_id = ?
         AND created_at > NOW() - INTERVAL '24 hours'`,
    )
    .all<{ id: string }>(userId)
  for (const t of trips) {
    await deleteTripById(db, t.id)
  }
  return trips.length
}

export async function userCanPublishTrips(db: SqlClient, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT can_publish FROM driver_settings WHERE user_id = ?`)
    .get<{ can_publish: boolean }>(userId)
  if (!row) return true
  return Boolean(row.can_publish)
}

export async function userPublishSummary(db: SqlClient, userId: string) {
  const status = await getPublishStatus(db, userId)
  const canPublish = await userCanPublishTrips(db, userId)
  return {
    ...status,
    canPublish,
    allowed: status.allowed && canPublish,
  }
}