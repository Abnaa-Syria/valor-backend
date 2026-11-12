import { Router } from 'express';
import { requireAdmin } from './middlewares/admin-auth';
import { requireUser } from './middlewares/user-auth';
import healthRoutes from './modules/health/health.routes';
// Mobile
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import gamesRoutes from './modules/games/games.routes';
import creditsRoutes from './modules/credits/credits.routes';
import clipsRoutes from './modules/clips/clips.routes';
import battlesRoutes from './modules/battles/battles.routes';
import rematchRoutes from './modules/battles/rematch.routes';
import leaderboardRoutes from './modules/leaderboard/leaderboard.routes';
import storeRoutes from './modules/store/store.routes';
import giftsRoutes from './modules/gifts/gifts.routes';
import customizationRoutes, { appConfigRouter } from './modules/customization/customization.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import reportsRoutes from './modules/reports/reports.routes';
// Dashboard
import { adminsRouter, authRouter as adminAuthRoutes } from './modules/admins/admins.routes';
import usersAdminRoutes from './modules/users/users.admin.routes';
import statsAdminRoutes from './modules/stats/stats.admin.routes';
import settingsAdminRoutes from './modules/settings/settings.admin.routes';
import gamesAdminRoutes from './modules/games/games.admin.routes';
import { clipsAdminRouter, commentsAdminRouter } from './modules/clips/clips.admin.routes';
import { battlesAdminRouter, entriesAdminRouter, rematchesAdminRouter } from './modules/battles/battles.admin.routes';
import reportsAdminRoutes from './modules/reports/reports.admin.routes';
import storeAdminRoutes from './modules/store/store.admin.routes';
import badgesAdminRoutes from './modules/badges/badges.admin.routes';
import uploadsAdminRoutes from './modules/uploads/uploads.admin.routes';
import auditAdminRoutes from './modules/audit/audit.admin.routes';
import announcementsAdminRoutes from './modules/announcements/announcements.admin.routes';

// ── Mobile API: /api/v1/* ──
const appRouter = Router();
appRouter.use('/auth', authRoutes);
appRouter.use('/app-config', appConfigRouter); // public: default theme before login
appRouter.use(requireUser); // everything below needs a logged-in player
appRouter.use('/', usersRoutes); // /me, /me/avatar, /me/badges, /players/:id
appRouter.use('/', giftsRoutes); // /gifts, /me/popularity
appRouter.use('/games', gamesRoutes);
appRouter.use('/wallet', creditsRoutes);
appRouter.use('/clips', clipsRoutes);
appRouter.use('/battles', battlesRoutes);
appRouter.use('/rematches', rematchRoutes);
appRouter.use('/leaderboard', leaderboardRoutes);
appRouter.use('/store', storeRoutes);
appRouter.use('/cosmetics', customizationRoutes);
appRouter.use('/notifications', notificationsRoutes);
appRouter.use('/reports', reportsRoutes);

// ── Dashboard API: /api/admin/* ──
const adminRouter = Router();
adminRouter.use('/auth', adminAuthRoutes);
adminRouter.use(requireAdmin()); // everything below needs a logged-in admin
adminRouter.use('/stats', statsAdminRoutes);
adminRouter.use('/users', usersAdminRoutes);
adminRouter.use('/games', gamesAdminRoutes);
adminRouter.use('/clips', clipsAdminRouter);
adminRouter.use('/comments', commentsAdminRouter);
adminRouter.use('/battles', battlesAdminRouter);
adminRouter.use('/entries', entriesAdminRouter);
adminRouter.use('/rematches', rematchesAdminRouter);
adminRouter.use('/reports', reportsAdminRoutes);
adminRouter.use('/store', storeAdminRoutes);
adminRouter.use('/badges', badgesAdminRoutes);
adminRouter.use('/settings', settingsAdminRoutes);
adminRouter.use('/admins', adminsRouter);
adminRouter.use('/uploads', uploadsAdminRoutes);
adminRouter.use('/announcements', announcementsAdminRoutes);
adminRouter.use('/audit', auditAdminRoutes);

const router = Router();
router.use('/health', healthRoutes);
router.use('/v1', appRouter);
router.use('/admin', adminRouter);

export default router;
