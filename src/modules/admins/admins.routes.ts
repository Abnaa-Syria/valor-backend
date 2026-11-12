import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { allowRoles, requireAdmin } from '../../middlewares/admin-auth';
import * as controller from './admins.controller';

// Dashboard: /api/admin/auth
export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, try again later' } },
});

authRouter.post('/login', loginLimiter, controller.login);
authRouter.get('/me', requireAdmin(), controller.me);
authRouter.post('/change-password', requireAdmin(), controller.changePassword);

// Dashboard: /api/admin/admins (super admin only)
export const adminsRouter = Router();
adminsRouter.use(allowRoles('SUPER_ADMIN'));
adminsRouter.get('/', controller.list);
adminsRouter.post('/', controller.create);
adminsRouter.patch('/:id', controller.update);
