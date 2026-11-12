import { z } from 'zod';

/**
 * Every app setting, with its validation and default.
 * Most of these are open product decisions (see the Figma decision register),
 * so they are editable from the dashboard instead of hard-coded.
 */
export const settingsRegistry = {
  votingDurationHours: {
    schema: z.number().int().min(1).max(168),
    default: 24,
  },
  dailyFreeVotingCredits: {
    schema: z.number().int().min(0).max(100),
    default: 5,
  },
  dailyFreeChallengeCredits: {
    schema: z.number().int().min(0).max(100),
    default: 5,
  },
  dailyResetTimezone: {
    schema: z.string().refine(isValidTimezone, 'Unknown timezone'),
    default: 'Asia/Riyadh',
  },
  creditDeductionOrder: {
    schema: z.enum(['FREE_FIRST', 'PURCHASED_FIRST']),
    default: 'FREE_FIRST',
  },
  matchmakingTimeoutMinutes: {
    schema: z.number().int().min(5).max(10080),
    default: 1440,
  },
  referralPopularityPoints: {
    schema: z.number().int().min(0).max(1000),
    default: 10,
  },
  rematchRequestWindowHours: {
    schema: z.number().int().min(1).max(168),
    default: 48,
  },
  rematchAcceptHours: {
    schema: z.number().int().min(1).max(168),
    default: 24,
  },
} as const;

export type SettingKey = keyof typeof settingsRegistry;
export type SettingsValues = { [K in SettingKey]: z.infer<(typeof settingsRegistry)[K]['schema']> };

export const settingKeys = Object.keys(settingsRegistry) as SettingKey[];

export const updateSettingsSchema = z
  .object(
    Object.fromEntries(settingKeys.map((key) => [key, settingsRegistry[key].schema.optional()])) as {
      [K in SettingKey]: z.ZodOptional<(typeof settingsRegistry)[K]['schema']>;
    },
  )
  .strict();

function isValidTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
