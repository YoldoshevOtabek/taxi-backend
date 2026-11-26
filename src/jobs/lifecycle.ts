import { getDb, type AppDatabase } from '../db/index.js'
import { deleteTripById } from '../utils/adminUser.js'

const HOURS_24 = `INTERVAL '24 hours'`
const MONTH_1 = `INTERVAL '30 days'`

export async function runLifecycle(db: AppDatabase = getDb()): Promise<void> {
  await db
    .prepare(
      `UPDATE driver_settings
       SET publish_bonus_expires_at = NOW() + ${HOURS_24}
       WHERE publish_bonus > 0 AND publish_bonus_expires_at IS NULL`,
    )
    .run()

  await db
    .prepare(
      `UPDATE driver_settings
       SET publish_bonus = 0, publish_bonus_expires_at = NULL
       WHERE publish_bonus > 0
         AND publish_bonus_expires_at IS NOT NULL
         AND publish_bonus_expires_at < NOW()`,
    )
    .run()

  await db
    .prepare(
      `UPDATE passenger_requests
       SET status = 'completed'
       WHERE COALESCE(status, 'active') = 'active'
         AND (
           (visible_until IS NOT NULL AND visible_until <= NOW())
           OR created_at < NOW() - ${HOURS_24}
         )`,
    )
    .run()

  await db
    .prepare(
      `UPDATE trips
       SET status = 'completed', available_seats = 0, completed_at = COALESCE(completed_at, NOW())
       WHERE status = 'active'
         AND created_at < NOW() - ${HOURS_24}`,
    )
    .run()

  const oldHistory = await db
    .prepare(
      `SELECT id FROM trips
       WHERE status <> 'active'
         AND COALESCE(completed_at, created_at) < NOW() - ${MONTH_1}`,
    )
    .all<{ id: string }>()
  for (const t of oldHistory) {
    await deleteTripById(db, t.id)
  }

  await db
    .prepare(
      `DELETE FROM passenger_requests
       WHERE COALESCE(status, 'active') <> 'active'
         AND created_at < NOW() - ${MONTH_1}`,
    )
    .run()
}

export function startLifecycleJob(): void {
  const tick = () => {
    void runLifecycle().catch((err) => {
      console.error('lifecycle job', err)
    })
  }
  tick()
  setInterval(tick, 60_000)
}
