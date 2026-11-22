import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { config } from '../config.js'

fs.mkdirSync(config.uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, config.uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
      ? ext
      : '.jpg'
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`)
  },
})

import type { Request } from 'express'

function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
): void {
  const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)
  if (!ok) {
    cb(new Error('Faqat rasm fayllari (JPG, PNG, WEBP, GIF)'))
    return
  }
  cb(null, true)
}

export const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
})