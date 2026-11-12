import { Router } from 'express';
import { allowRoles } from '../../middlewares/admin-auth';
import { updateSettingsSchema } from './settings.registry';
import * as settingsService from './settings.service';
import { audit } from '../audit/audit.service';

const router = Router();

router.get('/', async (_req, res) => {
  res.json({ data: { values: await settingsService.getSettings(), defaults: settingsService.getDefaults() } });
});

router.patch('/', allowRoles('SUPER_ADMIN'), async (req, res) => {
  const changes = updateSettingsSchema.parse(req.body);
  const values = await settingsService.updateSettings(changes, req.admin!.id);
  await audit(req, { action: 'settings.update', entityType: 'settings', summary: `Changed ${Object.keys(changes).join(', ')}`, details: changes });
  res.json({ data: { values, defaults: settingsService.getDefaults() } });
});

export default router;
