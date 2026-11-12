import { rateLimit } from 'express-rate-limit';

/**
 * Per-player limits on write actions, so one account can't flood votes, uploads, comments or
 * reports. Counted per player id (after requireUser), not per IP, so players behind the same
 * mobile network don't share a limit.
 *
 * The counter lives in memory: with several API servers, move it to a shared store (Redis).
 */
function perPlayer(name: string, windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${name}:${req.user?.id ?? 'anonymous'}`,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'You are doing that too often. Try again in a moment.' } },
  });
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const limits = {
  vote: perPlayer('vote', MINUTE, 60),
  clipUpload: perPlayer('clip-upload', HOUR, 30),
  battleEntry: perPlayer('battle-entry', HOUR, 30),
  rematch: perPlayer('rematch', HOUR, 20),
  comment: perPlayer('comment', MINUTE, 20),
  like: perPlayer('like', MINUTE, 120),
  report: perPlayer('report', HOUR, 20),
  purchase: perPlayer('purchase', 10 * MINUTE, 30),
  block: perPlayer('block', HOUR, 60),
  profileImage: perPlayer('profile-image', HOUR, 20),
};
