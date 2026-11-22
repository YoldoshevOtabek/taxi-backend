import type { SqlClient } from './client.js'

export async function seedDemoUser(db: SqlClient): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (id, telegram_id, role, full_name, phone)
       VALUES ('demo-user', '999001', 'passenger', 'Demo foydalanuvchi', '')
       ON CONFLICT (id) DO NOTHING`,
    )
    .run()
}
