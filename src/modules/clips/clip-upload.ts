import path from 'node:path';
import multer from 'multer';
import { env } from '../../config/env';
import { randomToken } from '../../lib/crypto';
import { storage } from '../../lib/storage';
import { AppError } from '../../utils/app-error';

export const CLIPS_PREFIX = 'clips';

const allowedTypes: Record<string, string[]> = {
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  thumbnail: ['image/jpeg', 'image/png', 'image/webp'],
};

/** Accepts one `video` file (required by the handler) and one optional `thumbnail` image. */
export const clipUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, storage.dirFor(CLIPS_PREFIX)),
    filename: (_req, file, cb) => cb(null, `${randomToken(16)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: env.VIDEO_MAX_MB * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const allowed = allowedTypes[file.fieldname];
    if (!allowed) return cb(new AppError(400, 'UPLOAD_ERROR', `Unexpected file field "${file.fieldname}"`));
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', `${file.fieldname} must be one of: ${allowed.join(', ')}`));
    }
    cb(null, true);
  },
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

export function uploadedFiles(files: unknown) {
  const map = (files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  return { video: map.video?.[0], thumbnail: map.thumbnail?.[0] };
}
