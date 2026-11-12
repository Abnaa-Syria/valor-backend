import path from 'node:path';
import multer from 'multer';
import { randomToken } from '../../lib/crypto';
import { storage } from '../../lib/storage';
import { AppError } from '../../utils/app-error';

export const IMAGES_PREFIX = 'images';
const allowed = ['image/jpeg', 'image/png', 'image/webp'];

/** Accepts one `image` file (jpeg / png / webp, max 5 MB) and stores it under `prefix/`. */
export function makeImageUpload(prefix: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, storage.dirFor(prefix)),
      filename: (_req, file, cb) => cb(null, `${randomToken(16)}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (file.fieldname !== 'image') return cb(new AppError(400, 'UPLOAD_ERROR', 'Send the file in the "image" field'));
      if (!allowed.includes(file.mimetype)) {
        return cb(new AppError(415, 'UNSUPPORTED_FILE_TYPE', `image must be one of: ${allowed.join(', ')}`));
      }
      cb(null, true);
    },
  }).single('image');
}

/** Player avatars and banners. */
export const imageUpload = makeImageUpload(IMAGES_PREFIX);
