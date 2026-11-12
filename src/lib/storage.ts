import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * File storage. v1 keeps files on the API server's disk and serves them from /uploads.
 * The database stores only keys (e.g. "clips/abc.mp4"), so moving to Cloudflare Stream / R2
 * later means changing this file, not the data.
 */
const rootDir = path.resolve(env.UPLOAD_DIR);

export const storage = {
  rootDir,

  /** Absolute folder for a key prefix, created if missing. */
  dirFor(prefix: string): string {
    const dir = path.join(rootDir, prefix);
    mkdirSync(dir, { recursive: true });
    return dir;
  },

  /** Storage key for a file saved under a prefix folder. */
  keyFor(prefix: string, fileName: string): string {
    return `${prefix}/${fileName}`;
  },

  url(key: string | null | undefined): string | null {
    return key ? `${env.PUBLIC_BASE_URL}/uploads/${key}` : null;
  },

  /** Reverse of url(): the key of a file we serve, or null for an outside URL. */
  keyFromUrl(url: string | null | undefined): string | null {
    const prefix = `${env.PUBLIC_BASE_URL}/uploads/`;
    return url?.startsWith(prefix) ? url.slice(prefix.length) : null;
  },

  async remove(key: string | null | undefined): Promise<void> {
    if (!key) return;
    const target = path.resolve(rootDir, key);
    if (!target.startsWith(rootDir + path.sep)) return; // never leave the uploads folder
    try {
      await rm(target, { force: true });
    } catch (err) {
      logger.warn({ err, key }, 'Could not delete stored file');
    }
  },
};
