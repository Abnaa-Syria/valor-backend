import { z } from 'zod';
import type { CosmeticKind } from '@prisma/client';
import { AppError } from '../../utils/app-error';

/**
 * What a frame and a theme are made of.
 *
 * THEME — the "VALOR Theme" token set from Figma (one mode per theme). Every screen in the app
 * reads these tokens, so switching theme restyles the whole app. Colors are #RRGGBB or #RRGGBBAA,
 * radii are in points.
 *
 * FRAME — ring artwork (assetUrl, transparent PNG) drawn over the avatar. `layout` says where the
 * avatar circle and the ring sit inside a square canvas, as fractions (0–1), so the app can draw
 * it at any size. `glowColor` lights the preview stage and profile header.
 */

type TokenDef = { key: string; type: 'color' | 'radius'; label: string };
type TokenGroup = { group: string; description: string; tokens: TokenDef[] };

const c = (key: string, label: string): TokenDef => ({ key, type: 'color', label });
const r = (key: string, label: string): TokenDef => ({ key, type: 'radius', label });

export const themeTokenGroups: TokenGroup[] = [
  {
    group: 'Core',
    description: 'The 17 tokens every screen uses.',
    tokens: [
      c('bg', 'Background'),
      c('surface', 'Surface'),
      c('surface-raised', 'Raised surface'),
      c('border-subtle', 'Subtle border'),
      c('border-control', 'Control border'),
      c('accent', 'Accent'),
      c('accent-secondary', 'Secondary accent'),
      c('accent-text', 'Accent text & links'),
      c('on-accent', 'Text on accent'),
      c('text-primary', 'Primary text'),
      c('text-secondary', 'Secondary text'),
      c('text-muted', 'Muted text'),
      c('disabled-surface', 'Disabled fill'),
      c('disabled-text', 'Disabled text'),
      c('nav-inactive', 'Inactive nav'),
      r('radius-card', 'Card corners'),
      r('radius-control', 'Control corners'),
    ],
  },
  {
    group: 'Cards & surfaces',
    description: 'Gradient stops and tinted surfaces for cards, badges and insets.',
    tokens: [
      c('bg-deep', 'Deep background'),
      c('surface-accent', 'Accent surface'),
      c('card-top', 'Card top'),
      c('card-bottom', 'Card bottom'),
      c('card-accent-top', 'Accent card top'),
      c('card-accent-top-2', 'Accent card top 2'),
      c('card-magenta-top', 'Magenta card top'),
      c('badge-top', 'Badge top'),
      c('badge-bottom', 'Badge bottom'),
      c('inset', 'Inset'),
    ],
  },
  {
    group: 'Hero & buttons',
    description: 'Hero and signature-card gradients, and the main call-to-action gradient.',
    tokens: [
      c('hero-1', 'Hero 1'),
      c('hero-2', 'Hero 2'),
      c('hero-3', 'Hero 3'),
      c('signature-1', 'Signature 1'),
      c('signature-2', 'Signature 2'),
      c('signature-3', 'Signature 3'),
      c('cta-start', 'Button start'),
      c('cta-mid', 'Button middle'),
      c('cta-end', 'Button end'),
    ],
  },
  {
    group: 'Glass & scrims',
    description: 'Translucent layers over video and images.',
    tokens: [
      c('rim-start', 'Rim light start'),
      c('rim-end', 'Rim light end'),
      c('glass-fill', 'Glass fill'),
      c('glass-stroke', 'Glass stroke'),
      c('glass-stroke-strong', 'Glass stroke (strong)'),
      c('glass-bar', 'Glass bar'),
      c('scrim-strong', 'Scrim strong'),
      c('scrim-mid', 'Scrim mid'),
      c('scrim-clear', 'Scrim clear'),
    ],
  },
  {
    group: 'Accent tints',
    description: 'Accent at low opacity for selected states and outlines.',
    tokens: [
      c('accent-tint', 'Accent tint'),
      c('accent-tint-soft', 'Accent tint (soft)'),
      c('accent-tint-strong', 'Accent tint (strong)'),
      c('accent-stroke', 'Accent stroke'),
      c('accent-stroke-soft', 'Accent stroke (soft)'),
    ],
  },
  {
    group: 'Labels & media',
    description: 'Status labels, badges, and text drawn over video or artwork.',
    tokens: [
      c('badge-neutral-text', 'Neutral badge text'),
      c('success-text', 'Success text'),
      c('gold-text', 'Gold text'),
      c('on-accent-badge', 'Text on accent badge'),
      c('on-media', 'On media'),
      c('on-media-secondary', 'On media (secondary)'),
      c('on-media-muted', 'On media (muted)'),
      c('on-media-accent', 'On media (accent)'),
    ],
  },
];

export const themeTokens = themeTokenGroups.flatMap((group) => group.tokens);

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use #RRGGBB or #RRGGBBAA')
  .transform((value) => value.toLowerCase());
const radius = z.number().int().min(0).max(40);

export const themeMetadataSchema = z.object({
  appearance: z.enum(['dark', 'light']),
  tokens: z.object(
    Object.fromEntries(themeTokens.map((t) => [t.key, t.type === 'color' ? hexColor : radius])) as Record<
      string,
      typeof hexColor | typeof radius
    >,
  ),
});

const fraction = z.number().min(0).max(1);

export const frameMetadataSchema = z.object({
  glowColor: hexColor,
  layout: z.object({
    avatar: z.object({ x: fraction, y: fraction, size: fraction }),
    ring: z.object({ x: fraction, y: fraction, width: fraction, height: fraction }),
  }),
});

/** The layout most frames use (from the Figma "Profile Frame" component, 168 pt canvas). */
export const defaultFrameLayout = {
  avatar: { x: 32 / 168, y: 32 / 168, size: 104 / 168 },
  ring: { x: 12 / 168, y: 12 / 168, width: 144 / 168, height: 144 / 168 },
};

export type ThemeMetadata = z.infer<typeof themeMetadataSchema>;
export type FrameMetadata = z.infer<typeof frameMetadataSchema>;

/** Validates metadata for a kind. Avatars carry none. */
export function parseCosmeticMetadata(kind: CosmeticKind, metadata: unknown) {
  if (kind === 'AVATAR') return null;
  const schema = kind === 'THEME' ? themeMetadataSchema : frameMetadataSchema;
  const parsed = schema.safeParse(metadata);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${kind.toLowerCase()} design`, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return parsed.data;
}

/** "Tight / Standard / Soft / Round" — the label the theme preview shows (design 33). */
export function cornerStyle(tokens: Record<string, unknown>) {
  const card = Number(tokens['radius-card'] ?? 16);
  if (card <= 6) return 'Sharp';
  if (card <= 10) return 'Tight';
  if (card <= 16) return 'Standard';
  return 'Round';
}
