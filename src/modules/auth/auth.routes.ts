import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as controller from './auth.controller';

// Mobile: /api/v1/auth
const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again later' } },
});

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password', authLimiter, controller.resetPassword);

export default router;
