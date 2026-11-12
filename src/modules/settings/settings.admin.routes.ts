import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { updateSettingsSchema } from './settings.registry';
import * as settingsService from './settings.service';

const router = Router();

router.get('/', async (_req, res) => {
  res.json({ data: { values: await settingsService.getSettings(), defaults: settingsService.getDefaults() } });
});

router.patch('/', allowRoles('SUPER_ADMIN'), async (req, res) => {
  const changes = updateSettingsSchema.parse(req.body);
  const values = await settingsService.updateSettings(changes, req.admin!.id);
  res.json({ data: { values, defaults: settingsService.getDefaults() } });
});

export default router;
