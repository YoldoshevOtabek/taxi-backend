import { config } from '../config.js'

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'HamrohTaxi API',
    version: '1.0.0',
    description:
      'Telegram Mini App backend: autentifikatsiya, profil (ism + avatar), safarlar, yo‘lovchi talablari.\n\n' +
      '**Dev:** Swagger Authorize → `X-Demo-User-Id: demo-user` yoki `Authorization: tma <initData>`.',
  },
  servers: [
    { url: `${config.publicBaseUrl}${config.apiPrefix}`, description: 'Joriy server' },
  ],
  tags: [
    { name: 'System' },
    { name: 'Auth' },
    { name: 'Profile' },
    { name: 'Trips' },
    { name: 'Passenger requests' },
  ],
  components: {
    securitySchemes: {
      TelegramInitData: {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization',
        description: '`tma <initData>` (Telegram WebApp)',
      },
      DemoUser: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Demo-User-Id',
        description: 'Faqat development. Qiymat: `demo-user`',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          role: { type: 'string', nullable: true, enum: ['passenger', 'driver', null] },
          fullName: { type: 'string' },
          phone: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          telegramId: { type: 'string' },
        },
      },
      DriverSettings: {
        type: 'object',
        nullable: true,
        properties: {
          carModel: { type: 'string' },
          carColor: { type: 'string' },
          plateNumber: { type: 'string' },
          driverModeEnabled: { type: 'boolean' },
        },
      },
      Trip: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          routeId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          departureDate: { type: 'string' },
          departureTime: { type: 'string' },
          pickupAddress: { type: 'string' },
          availableSeats: { type: 'integer' },
          totalSeats: { type: 'integer' },
          pricePerSeat: { type: 'number' },
          hasAirConditioner: { type: 'boolean' },
          hasLargeTrunk: { type: 'boolean' },
          hasRoofRack: { type: 'boolean' },
          hasWifi: { type: 'boolean' },
          note: { type: 'string', nullable: true },
          status: { type: 'string' },
          driver: { type: 'object' },
        },
      },
    },
  },
  security: [{ DemoUser: [] }, { TelegramInitData: [] }],
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'API ildizi',
        security: [],
        responses: {
          '200': {
            description: 'Mavjud endpointlar',
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    service: { type: 'string' },
                    version: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/telegram': {
      post: {
        tags: ['Auth'],
        summary: 'Telegram initData orqali kirish',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['initData'],
                properties: {
                  initData: { type: 'string' },
                  role: { type: 'string', enum: ['passenger', 'driver'] },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Foydalanuvchi' },
          '401': { description: 'Imzo noto‘g‘ri' },
        },
      },
    },
    '/users/me': {
      get: {
        tags: ['Profile'],
        summary: 'Joriy profil',
        responses: {
          '200': {
            description: 'Profil',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                    driver: { $ref: '#/components/schemas/DriverSettings' },
                  },
                },
              },
            },
          },
          '401': { description: 'Auth kerak' },
        },
      },
      patch: {
        tags: ['Profile'],
        summary: 'Ism, telefon, rolni yangilash',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  fullName: { type: 'string', minLength: 2 },
                  phone: { type: 'string' },
                  role: { type: 'string', enum: ['passenger', 'driver'] },
                },
              },
              example: { fullName: 'Ali Valiyev', phone: '+998901234567' },
            },
          },
        },
        responses: {
          '200': { description: 'Yangilangan profil' },
        },
      },
    },
    '/users/me/avatar': {
      post: {
        tags: ['Profile'],
        summary: 'Avatar yuklash (fayldan)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['avatar'],
                properties: {
                  avatar: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Yuklangan URL',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { avatarUrl: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Profile'],
        summary: 'Avatarni o‘chirish',
        responses: { '204': { description: 'O‘chirildi' } },
      },
    },
    '/users/me/driver': {
      put: {
        tags: ['Profile'],
        summary: 'Haydovchi profilini saqlash',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['carModel', 'carColor', 'plateNumber'],
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                  carModel: { type: 'string' },
                  carColor: { type: 'string' },
                  plateNumber: { type: 'string' },
                  driverModeEnabled: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/users/me/passenger': {
      put: {
        tags: ['Profile'],
        summary: 'Yo‘lovchi profilini saqlash',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fullName', 'phone'],
                properties: {
                  fullName: { type: 'string' },
                  phone: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/trips': {
      get: {
        tags: ['Trips'],
        summary: 'Faol e’lonlar',
        security: [],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string' } },
          { name: 'to', in: 'query', schema: { type: 'string' } },
          { name: 'date', in: 'query', schema: { type: 'string' } },
          {
            name: 'filter',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['cheapest', 'earliest', 'most_seats'],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Ro‘yxat',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Trip' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Trips'],
        summary: 'E’lon yaratish',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'routeId',
                  'from',
                  'to',
                  'departureDate',
                  'departureTime',
                  'pickupAddress',
                  'availableSeats',
                  'pricePerSeat',
                ],
                properties: {
                  routeId: { type: 'string' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  departureDate: { type: 'string' },
                  departureTime: { type: 'string' },
                  pickupAddress: { type: 'string' },
                  availableSeats: { type: 'integer' },
                  pricePerSeat: { type: 'number' },
                  hasAirConditioner: { type: 'boolean' },
                  hasLargeTrunk: { type: 'boolean' },
          hasRoofRack: { type: 'boolean' },
                  hasWifi: { type: 'boolean' },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Yaratildi' } },
      },
    },
    '/trips/{id}': {
      get: {
        tags: ['Trips'],
        summary: 'Bitta e’lon',
        security: [],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Trip' },
          '404': { description: 'Topilmadi' },
        },
      },
      patch: {
        tags: ['Trips'],
        summary: 'O‘z e’lonini tahrirlash',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Yangilandi' },
          '403': { description: 'Ruxsat yo‘q' },
          '404': { description: 'Topilmadi' },
        },
      },
    },
    '/trips/{id}/close': {
      patch: {
        tags: ['Trips'],
        summary: 'E’lonni yopish',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/trips/{id}/complete': {
      patch: {
        tags: ['Trips'],
        summary: 'Safarni yakunlash',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/passenger-requests': {
      get: {
        tags: ['Passenger requests'],
        summary: 'Talablar ro‘yxati',
        security: [],
        responses: { '200': { description: 'Ro‘yxat' } },
      },
      post: {
        tags: ['Passenger requests'],
        summary: 'Talab yaratish',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: [
                  'routeId',
                  'from',
                  'to',
                  'date',
                  'passengerCount',
                  'preferredTime',
                  'offeredPrice',
                  'visibleUntil',
                ],
                properties: {
                  routeId: { type: 'string' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  date: { type: 'string' },
                  passengerCount: { type: 'integer' },
                  preferredTime: { type: 'string' },
                  offeredPrice: { type: 'number' },
                  phone: { type: 'string' },
                  note: { type: 'string' },
                  visibleFrom: { type: 'string' },
                  visibleUntil: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Yaratildi' } },
      },
    },
    '/passenger-requests/mine': {
      get: {
        tags: ['Passenger requests'],
        summary: 'Mening talablarim',
        responses: { '200': { description: 'Ro‘yxat' } },
      },
    },
    '/passenger-requests/{id}': {
      patch: {
        tags: ['Passenger requests'],
        summary: 'Talab holatini yangilash (found / closed)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
} as const
