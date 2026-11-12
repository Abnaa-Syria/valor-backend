import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { settingKeys, settingsRegistry, type SettingKey, type SettingsValues } from './settings.registry';

/** Returns every setting: the stored value when valid, otherwise the default. */
export async function getSettings(): Promise<SettingsValues> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: settingKeys } } });
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const values = {} as Record<SettingKey, unknown>;
  for (const key of settingKeys) {
    const entry = settingsRegistry[key];
    const parsed = entry.schema.safeParse(stored.get(key));
    if (stored.has(key) && !parsed.success) {
      logger.warn({ key }, 'Stored setting is invalid, falling back to default');
    }
    values[key] = parsed.success ? parsed.data : entry.default;
  }
  return values as SettingsValues;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingsValues[K]> {
  return (await getSettings())[key];
}

export async function updateSettings(changes: Partial<SettingsValues>, adminId: string) {
  const entries = Object.entries(changes).filter(([, value]) => value !== undefined);

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: adminId },
        update: { value: value as Prisma.InputJsonValue, updatedById: adminId },
      }),
    ),
  );

  return getSettings();
}

export function getDefaults(): SettingsValues {
  return Object.fromEntries(settingKeys.map((key) => [key, settingsRegistry[key].default])) as SettingsValues;
}
