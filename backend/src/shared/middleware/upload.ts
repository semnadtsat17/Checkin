/**
 * Multer configuration for photo uploads.
 *
 * Photos are stored as files on disk under <dataDir>/photos/.
 * The stored filename (relative path) is saved in the attendance record.
 * Serving the files back is handled by a static route in server.ts.
 */
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../../config';

const photoDir = path.join(config.dataDir, 'photos');

if (!fs.existsSync(photoDir)) {
  fs.mkdirSync(photoDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photoDir),
  filename: (_req, _file, cb) => {
    // Unique name: timestamp + random suffix, always .jpg
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    cb(null, name);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
}).single('photo');

/** Resolve a stored filename back to a public URL path. */
export function photoUrl(filename: string): string {
  return `/photos/${filename}`;
}
