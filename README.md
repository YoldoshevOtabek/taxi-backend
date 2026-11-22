# YO'L Backend (Node.js + Express)

Telegram Mini App uchun REST API: autentifikatsiya, profil (ism + rasm yuklash), safarlar, yo‘lovchi talablari.

## Talablar

- **Node.js 22+**
- **Neon PostgreSQL** — `DATABASE_URL` (pooled) va `DATABASE_URL_UNPOOLED` (migratsiya). `.env` ga `neon env pull` yoki `neon deploy` yozadi.

## O‘rnatish

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Neon:

```bash
neon init -y --org-id <org> --project-id <project> --branch production --services postgres
neon deploy
npm run db:migrate
```

Server: `http://localhost:3001/api/v1`  
Swagger: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

`GET /api/v1` — API ildizi (endpointlar ro‘yxati). `GET /` Swagger’ga yo‘naltiradi.

## Profil va rasm

| Method | Endpoint | Tavsif |
|--------|----------|--------|
| GET | `/users/me` | Joriy foydalanuvchi |
| PATCH | `/users/me` | `fullName`, `phone`, `role` |
| POST | `/users/me/avatar` | `multipart/form-data`, maydon: `avatar` |
| DELETE | `/users/me/avatar` | Rasmni o‘chirish |
| PUT | `/users/me/driver` | Haydovchi profili |
| PUT | `/users/me/passenger` | Yo‘lovchi profili |

Rasmlar: `uploads/avatars/`, URL: `http://localhost:3001/uploads/avatars/<file>`.

## Autentifikatsiya

Production: `Authorization: tma <initData>`

Development (BOT_TOKEN bo‘lmasa): imzo tekshiruvi yumshoq; yoki `X-Demo-User-Id: demo-user` bilan sinov.

`POST /auth/telegram` — `{ "initData": "...", "role": "driver" | "passenger" }`

## Frontend ulanish

`.env` (frontend):

```env
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_USE_API=true
```