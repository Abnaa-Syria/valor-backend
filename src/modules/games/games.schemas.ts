import { z } from 'zod';

const optionList = z.array(z.string().trim().min(1).max(60)).max(50);

/** Battle criteria VALOR sets per game. Players pick one of each when entering a battle. */
export const gameCriteriaSchema = z.object({
  weaponClasses: optionList.default([]),
  ranks: optionList.default([]),
});

export type GameCriteria = z.infer<typeof gameCriteriaSchema>;

export const createGameSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  iconUrl: z.url().max(500).nullish(),
  criteria: gameCriteriaSchema,
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const updateGameSchema = createGameSchema.partial();

export const gameIdParamsSchema = z.object({ id: z.string().min(1).max(30) });

/** Reads criteria stored as JSON, tolerating old or missing values. */
export function parseCriteria(value: unknown): GameCriteria {
  const parsed = gameCriteriaSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { weaponClasses: [], ranks: [] };
}
