import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '..')

export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',
  botToken: process.env.BOT_TOKEN ?? '',
  corsOrigin:
    process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:5174',
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseUrlUnpooled:
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  databasePath: path.resolve(
    backendRoot,
    process.env.DATABASE_PATH ?? './data/yol.sqlite',
  ),
  uploadDir: path.resolve(
    backendRoot,
    process.env.UPLOAD_DIR ?? './uploads/avatars',
  ),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001',
  adminUsername: process.env.ADMIN_USERNAME ?? 'Otabek',
  adminPassword:
    process.env.ADMIN_PASSWORD ??
    ((process.env.NODE_ENV ?? 'development') === 'development' ? 'bek2506' : ''),
  adminApiToken:
    process.env.ADMIN_API_TOKEN ??
    ((process.env.NODE_ENV ?? 'development') === 'development'
      ? 'yol-admin-local-token'
      : ''),
}