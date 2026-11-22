import type { Express } from 'express'
import swaggerUi from 'swagger-ui-express'
import { config } from '../config.js'
import { openApiSpec } from './openapi.js'

export const swaggerPath = '/api/docs'

export function mountSwagger(app: Express): void {
  const spec = JSON.parse(JSON.stringify(openApiSpec)) as Record<string, unknown>

  app.get(`${swaggerPath}.json`, (_req, res) => {
    res.json(spec)
  })

  app.use(
    swaggerPath,
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: "YO'L API — Swagger",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  )
}

export function apiIndexBody() {
  const base = `${config.publicBaseUrl}${config.apiPrefix}`
  return {
    ok: true,
    service: 'yol-backend',
    version: '1.0.0',
    docs: `${config.publicBaseUrl}${swaggerPath}`,
    openapi: `${config.publicBaseUrl}${swaggerPath}.json`,
    endpoints: {
      health: `${base}/health`,
      me: `${base}/users/me`,
      avatar: `${base}/users/me/avatar`,
      trips: `${base}/trips`,
      tripsMine: `${base}/trips/mine`,
      publishStatus: `${base}/trips/publish-status`,
      passengerRequests: `${base}/passenger-requests`,
      favorites: `${base}/favorites`,
      admin: `${base}/admin`,
      adminLogin: `${base}/admin/login`,
      authTelegram: `${base}/auth/telegram`,
    },
  }
}
