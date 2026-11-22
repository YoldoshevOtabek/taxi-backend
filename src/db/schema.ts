import type { SqlClient } from './client.js'

const INIT_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    telegram_id TEXT UNIQUE,
    role TEXT CHECK (role IS NULL OR role IN ('passenger', 'driver')),
    full_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    avatar_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS driver_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    car_model TEXT NOT NULL DEFAULT '',
    car_color TEXT NOT NULL DEFAULT '',
    plate_number TEXT NOT NULL DEFAULT '',
    driver_mode_enabled INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    driver_user_id TEXT NOT NULL REFERENCES users(id),
    route_id TEXT NOT NULL,
    from_city TEXT NOT NULL,
    to_city TEXT NOT NULL,
    departure_date TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    pickup_address TEXT NOT NULL,
    available_seats INTEGER NOT NULL,
    total_seats INTEGER NOT NULL DEFAULT 4,
    price_per_seat INTEGER NOT NULL,
    has_ac INTEGER NOT NULL DEFAULT 1,
    has_trunk INTEGER NOT NULL DEFAULT 1,
    has_wifi INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS passenger_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    route_id TEXT NOT NULL,
    from_city TEXT NOT NULL,
    to_city TEXT NOT NULL,
    request_date TEXT NOT NULL,
    passenger_count INTEGER NOT NULL,
    preferred_time TEXT NOT NULL,
    offered_price INTEGER NOT NULL,
    phone TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trip_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, trip_id)
  );
`

export async function migrate(db: SqlClient): Promise<void> {
  await db.exec(INIT_SQL)
}
