import { Router } from 'express'
import { getDb } from '../db/index.js'
import { authMiddleware } from '../middleware/auth.js'
import { TRIP_SELECT_JOIN, serializeTrip, type TripRow } from '../utils/tripDto.js'

export const favoritesRouter = Router()

favoritesRouter.use(authMiddleware)

favoritesRouter.get('/', async (req, res, next) => {
  try {
    const db = getDb()
    const rows = await db
      .prepare(
        `${TRIP_SELECT_JOIN}
         JOIN favorites f ON f.trip_id = t.id
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC`,
      )
      .all<TripRow>(req.authUser!.id)
    res.json(rows.map(serializeTrip))
  } catch (err) {
    next(err)
  }
})

favoritesRouter.post('/:tripId', async (req, res, next) => {
  try {
    const db = getDb()
    const trip = await db
      .prepare(`SELECT id FROM trips WHERE id = ?`)
      .get<{ id: string }>(req.params.tripId)
    if (!trip) {
      res.status(404).json({ error: 'Safar topilmadi' })
      return
    }
    await db
      .prepare(
        `INSERT INTO favorites (user_id, trip_id) VALUES (?, ?)
         ON CONFLICT (user_id, trip_id) DO NOTHING`,
      )
      .run(req.authUser!.id, req.params.tripId)
    res.status(201).json({ ok: true, tripId: req.params.tripId })
  } catch (err) {
    next(err)
  }
})

favoritesRouter.delete('/:tripId', async (req, res, next) => {
  try {
    const db = getDb()
    await db
      .prepare(`DELETE FROM favorites WHERE user_id = ? AND trip_id = ?`)
      .run(req.authUser!.id, req.params.tripId)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})