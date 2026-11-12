import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { paginationSchema } from '../../utils/pagination';
import { audit } from '../audit/audit.service';
import { announcementSchema, listAnnouncements, sendAnnouncement } from './announcements.service';

// Dashboard: /api/admin/announcements
const router = Router();

router.get('/', async (req, res) => {
  res.json({ data: await listAnnouncements(paginationSchema.parse(req.query)) });
});

router.post('/', allowRoles('SUPER_ADMIN', 'ADMIN'), async (req, res) => {
  const input = announcementSchema.parse(req.body);
  const announcement = await sendAnnouncement(req.admin!.id, input);
  await audit(req, {
    action: 'announcement.send',
    entityType: 'announcement',
    entityId: announcement.id,
    summary: `Sent "${input.title}" to ${announcement.recipients} player${announcement.recipients === 1 ? '' : 's'}`,
  });
  res.status(201).json({ data: announcement });
});

export default router;
