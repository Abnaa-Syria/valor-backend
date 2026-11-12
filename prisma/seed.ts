/**
 * Seeds reference data taken from the Figma design.
 * Safe to run more than once: every row is an upsert.
 * Items the client hasn't confirmed (Mid / Advanced gifts, premium prices) are left out or set to null.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma, PrismaClient, type CosmeticKind, type CreditType, type GiftKind, type GiftTier } from '@prisma/client';

const prisma = new PrismaClient();

// Game names and criteria are placeholders in the design ("Placeholder game").
const games = [
  { slug: 'neon-siege', name: 'Neon Siege' },
  { slug: 'iron-dusk', name: 'Iron Dusk' },
  { slug: 'rift-ops', name: 'Rift Ops' },
];
const placeholderCriteria = {
  weaponClasses: ['Sniper', 'Assault rifle', 'SMG', 'Shotgun'],
  ranks: ['Bronze', 'Silver', 'Gold I', 'Gold II', 'Platinum'],
};

const creditPacks: { type: CreditType; credits: number; priceSar: string }[] = [
  { type: 'VOTING', credits: 5, priceSar: '2.99' },
  { type: 'VOTING', credits: 10, priceSar: '5.99' },
  { type: 'VOTING', credits: 15, priceSar: '8.99' },
  { type: 'VOTING', credits: 20, priceSar: '11.99' },
  { type: 'CHALLENGE', credits: 5, priceSar: '4.99' },
  { type: 'CHALLENGE', credits: 10, priceSar: '8.99' },
  { type: 'CHALLENGE', credits: 15, priceSar: '12.99' },
  { type: 'CHALLENGE', credits: 20, priceSar: '15.99' },
];

const gifts: { slug: string; name: string; kind: GiftKind; tier: GiftTier; priceSar: string; popularityValue: number }[] = [
  { slug: 'spark', name: 'Spark', kind: 'GIFT', tier: 'ENTRY', priceSar: '1.99', popularityValue: 1 },
  { slug: 'heart', name: 'Heart', kind: 'GIFT', tier: 'ENTRY', priceSar: '1.99', popularityValue: 1 },
  { slug: 'gg', name: 'GG', kind: 'STICKER', tier: 'ENTRY', priceSar: '1.99', popularityValue: 1 },
  { slug: 'thumbs-up', name: 'Thumbs up', kind: 'STICKER', tier: 'STANDARD', priceSar: '4.99', popularityValue: 3 },
  { slug: 'clutch', name: 'Clutch', kind: 'STICKER', tier: 'STANDARD', priceSar: '4.99', popularityValue: 3 },
  { slug: 'replay', name: 'Replay', kind: 'STICKER', tier: 'STANDARD', priceSar: '4.99', popularityValue: 3 },
  { slug: 'legend', name: 'Legend', kind: 'GIFT', tier: 'LEGENDARY', priceSar: '399.00', popularityValue: 350 },
];

const cosmetics: { kind: CosmeticKind; slug: string; name: string; isFree: boolean; isDefault?: boolean }[] = [
  { kind: 'FRAME', slug: 'frame-origin', name: 'Origin', isFree: true, isDefault: true },
  { kind: 'FRAME', slug: 'frame-static', name: 'Static', isFree: true },
  { kind: 'FRAME', slug: 'frame-circuit', name: 'Circuit', isFree: false },
  { kind: 'FRAME', slug: 'frame-frost', name: 'Frost', isFree: false },
  { kind: 'FRAME', slug: 'frame-ember', name: 'Ember', isFree: false },
  { kind: 'FRAME', slug: 'frame-venom', name: 'Venom', isFree: false },
  { kind: 'FRAME', slug: 'frame-rift', name: 'Rift', isFree: false },
  { kind: 'FRAME', slug: 'frame-aegis', name: 'Aegis', isFree: false },
  { kind: 'FRAME', slug: 'frame-halo', name: 'Halo', isFree: false },
  { kind: 'FRAME', slug: 'frame-sovereign', name: 'Sovereign', isFree: false },
  { kind: 'THEME', slug: 'theme-valor-night', name: 'VALOR Night', isFree: true, isDefault: true },
  { kind: 'THEME', slug: 'theme-ember-forge', name: 'Ember Forge', isFree: false },
  { kind: 'THEME', slug: 'theme-arctic-ops', name: 'Arctic Ops', isFree: false },
  { kind: 'THEME', slug: 'theme-toxin', name: 'Toxin', isFree: false },
  { kind: 'THEME', slug: 'theme-royal-gold', name: 'Royal Gold', isFree: false },
  { kind: 'THEME', slug: 'theme-daybreak', name: 'Daybreak', isFree: false },
];

// Clear badges are awarded automatically by their criteria. The two without rules are awarded by admins.
const badges: { slug: string; name: string; criteria: { metric: string; min: number } | null; isCriteriaPending: boolean }[] = [
  { slug: 'first-win', name: 'First win', criteria: { metric: 'battlesWon', min: 1 }, isCriteriaPending: false },
  { slug: 'ten-battles', name: '10 battles', criteria: { metric: 'battlesPlayed', min: 10 }, isCriteriaPending: false },
  { slug: 'three-games', name: '3 games', criteria: { metric: 'gamesPlayed', min: 3 }, isCriteriaPending: false },
  { slug: 'first-post', name: 'First post', criteria: { metric: 'clipsPublished', min: 1 }, isCriteriaPending: false },
  { slug: 'king-of-revenge', name: 'King of Revenge', criteria: null, isCriteriaPending: true },
  { slug: 'weapon-mastery', name: 'Weapon Mastery', criteria: null, isCriteriaPending: true },
];

// Theme tokens (Figma "VALOR Theme" collection) and frame artwork exported from the
// "Profile Frame" component. Filled only where empty, so dashboard edits are never overwritten.
const seedAssets = path.join(__dirname, 'seed-assets');

const frameDesigns: Record<string, { glowColor: string; avatar: [number, number, number] }> = {
  // avatar = [x, y, size] in the 168 pt Figma canvas; the ring always sits at 12,12 · 144×144
  'frame-origin': { glowColor: '#545eca', avatar: [32, 32, 104] },
  'frame-static': { glowColor: '#df6d1d', avatar: [32, 32, 104] },
  'frame-circuit': { glowColor: '#3e99d6', avatar: [32, 32, 104] },
  'frame-ember': { glowColor: '#a1e017', avatar: [32, 32, 104] },
  'frame-frost': { glowColor: '#3ba1d6', avatar: [32, 32, 104] },
  'frame-venom': { glowColor: '#4c7fd4', avatar: [32, 32, 104] },
  'frame-rift': { glowColor: '#8434c4', avatar: [37, 42, 94] },
  'frame-aegis': { glowColor: '#a4834e', avatar: [36, 40, 96] },
  'frame-halo': { glowColor: '#4e87bd', avatar: [39, 43, 90] },
  'frame-sovereign': { glowColor: '#9e7661', avatar: [39, 39, 91] },
};

async function seedCosmeticDesigns() {
  const baseUrl = (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? 'uploads', 'catalog');
  mkdirSync(uploadDir, { recursive: true });

  const themes = JSON.parse(readFileSync(path.join(seedAssets, 'themes.json'), 'utf8')) as Record<string, unknown>;
  let themesFilled = 0;
  for (const [slug, design] of Object.entries(themes)) {
    const filled = await prisma.cosmeticItem.updateMany({
      where: { slug, metadata: { equals: Prisma.DbNull } },
      data: { metadata: design as Prisma.InputJsonValue },
    });
    themesFilled += filled.count;
  }

  let framesFilled = 0;
  for (const [slug, design] of Object.entries(frameDesigns)) {
    const item = await prisma.cosmeticItem.findUnique({ where: { slug } });
    if (!item || (item.assetUrl && item.metadata)) continue;

    const source = path.join(seedAssets, 'frames', `${slug.replace('frame-', '')}.png`);
    const fileName = `${slug}.png`;
    if (!item.assetUrl && existsSync(source)) copyFileSync(source, path.join(uploadDir, fileName));

    const [x, y, size] = design.avatar;
    await prisma.cosmeticItem.update({
      where: { id: item.id },
      data: {
        assetUrl: item.assetUrl ?? `${baseUrl}/uploads/catalog/${fileName}`,
        metadata: (item.metadata ?? {
          glowColor: design.glowColor,
          layout: {
            avatar: { x: x / 168, y: y / 168, size: size / 168 },
            ring: { x: 12 / 168, y: 12 / 168, width: 144 / 168, height: 144 / 168 },
          },
        }) as Prisma.InputJsonValue,
      },
    });
    framesFilled++;
  }
  console.log(`• Theme colors filled: ${themesFilled} · frame artwork filled: ${framesFilled}`);
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('• Skipped admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set)');
    return;
  }
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Admin ${email} already exists`);
    return;
  }
  await prisma.admin.create({
    data: {
      email,
      name: process.env.SEED_ADMIN_NAME ?? 'Super Admin',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`• Created super admin ${email}`);
}

async function main() {
  await seedAdmin();

  for (const [index, game] of games.entries()) {
    await prisma.game.upsert({
      where: { slug: game.slug },
      create: { ...game, criteria: placeholderCriteria, sortOrder: index },
      update: {},
    });
  }
  console.log(`• Games: ${games.length}`);

  for (const [index, pack] of creditPacks.entries()) {
    const storeProductId = `valor.${pack.type.toLowerCase()}.${pack.credits}`;
    await prisma.creditPack.upsert({
      where: { storeProductId },
      create: { ...pack, storeProductId, sortOrder: index },
      update: {},
    });
  }
  console.log(`• Credit packs: ${creditPacks.length}`);

  for (const [index, gift] of gifts.entries()) {
    await prisma.gift.upsert({
      where: { slug: gift.slug },
      create: { ...gift, storeProductId: `valor.gift.${gift.slug}`, sortOrder: index },
      update: {},
    });
  }
  console.log(`• Gifts: ${gifts.length} (Mid / Advanced tiers pending client)`);

  for (const [index, item] of cosmetics.entries()) {
    await prisma.cosmeticItem.upsert({
      where: { slug: item.slug },
      create: {
        ...item,
        priceSar: item.isFree ? 0 : null, // premium prices pending client
        storeProductId: item.isFree ? null : `valor.${item.slug}`,
        sortOrder: index,
      },
      update: {},
    });
  }
  await seedCosmeticDesigns();
  console.log(`• Frames & themes: ${cosmetics.length}`);

  for (const [index, { criteria, ...badge }] of badges.entries()) {
    const data = { ...badge, criteria: criteria ?? undefined, sortOrder: index };
    // Existing badges get their criteria filled in, but admin edits to names etc. are kept.
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      create: data,
      update: criteria ? { criteria } : {},
    });
  }
  console.log(`• Badges: ${badges.length}`);
}

main()
  .then(() => console.log('Seed complete'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
