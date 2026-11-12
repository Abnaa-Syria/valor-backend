/**
 * Demo data for testing every screen of the app and the dashboard.
 *
 *   npm run db:seed        (reference data: games, packs, gifts, frames, themes, badges, super admin)
 *   npm run db:seed:demo   (this file: players, clips with real videos, battles, votes, credits, store, moderation…)
 *
 * - Safe to run again: it first deletes the previous demo data (accounts ending in @demo.valor).
 * - Dates are spread over the last 90 days so lists, histories and charts are filled.
 * - Never runs when NODE_ENV=production.
 *
 * Videos: 10-second scenes from the Blender open movies "Tears of Steel" and "Sintel"
 * (© Blender Foundation, CC BY 3.0, mango.blender.org · durian.blender.org). See seed-assets/demo/CREDITS.md.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  Prisma,
  PrismaClient,
  type BattleSide,
  type CreditSource,
  type CreditType,
  type LedgerReason,
  type NotificationType,
  type ReportStatus,
  type ReportTarget,
} from '@prisma/client';
import { checkBadges } from '../src/modules/badges/badges.service';
import { getSettings } from '../src/modules/settings/settings.service';

const prisma = new PrismaClient();

const DEMO_DOMAIN = '@demo.valor';
const DEMO_PASSWORD = 'Valor12345!';
const ASSETS = path.join(__dirname, 'seed-assets', 'demo');
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000';
const fileUrl = (key: string) => `${PUBLIC_BASE}/uploads/${key}`;

// ───────────── Deterministic randomness (same demo every run) ─────────────

let seed = 20261112;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
const chance = (p: number) => rand() < p;
function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const NOW = new Date();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms);
const between = (from: Date, to: Date) => new Date(from.getTime() + rand() * (to.getTime() - from.getTime()));

// ───────────── Content ─────────────

const VIDEOS: Record<string, string[]> = {
  'scope-lock': ['Scope lock on the convoy', 'Three ships, one scope', 'Overwatch from the tower'],
  'last-stand': ['Last stand at the window', 'Held the gate alone', '1v3 on the balcony'],
  'night-patrol': ['Night patrol flank', 'Silent walk to the vault', 'Into the dark hangar'],
  'street-mech': ['Mech in the street', 'Walked right past it', 'Ambush by the canal'],
  'bridge-ambush': ['Bridge ambush', 'Waited on the bridge', 'They never saw it coming'],
  'iron-giant': ['Iron giant down', 'Rooftop mech fight', 'Took the titan solo'],
  'long-shot': ['Long shot through the glass', 'Calm hands, clean shot', 'Eye on the target'],
  'heavy-cannon': ['Heavy cannon spin-up', 'Rail cannon clutch', 'Full charge, full send'],
  'dark-sector': ['Dark sector push', 'No lights, no mercy', 'Clutch in the dark'],
  'canal-clutch': ['Canal clutch', 'Flanked by the water', 'Clean read on the canal'],
  'mech-blueprint': ['Mech rebuild montage', 'Blueprint to battlefield', 'Built different'],
  'frozen-pass': ['Frozen pass ambush', 'Alley fight in the ruins', 'First blood in the pass'],
  'burning-city': ['Burning city run', 'Escape through the flames', 'Rooftops on fire'],
  'dragon-dive': ['Dragon dive', 'Caught it mid-air', 'Sky fight over the dunes'],
};
const VIDEO_NAMES = Object.keys(VIDEOS);
const AVATARS = ['ranger', 'shade', 'oracle', 'rook', 'titan', 'drift', 'ember', 'circuit'];

const PLAYERS: { username: string; joinedDaysAgo: number; status?: 'SUSPENDED' | 'BANNED' | 'DELETED'; avatar?: string }[] = [
  { username: 'ShadowVex', joinedDaysAgo: 89, avatar: 'shade' },
  { username: 'NyxRaider', joinedDaysAgo: 88, avatar: 'ember' },
  { username: 'KaiStorm', joinedDaysAgo: 86, avatar: 'ranger' },
  { username: 'JunoBlaze', joinedDaysAgo: 84 },
  { username: 'OrinFrost', joinedDaysAgo: 80, avatar: 'oracle' },
  { username: 'LyraVolt', joinedDaysAgo: 77 },
  { username: 'DexHollow', joinedDaysAgo: 74, avatar: 'rook' },
  { username: 'MiraPulse', joinedDaysAgo: 71 },
  { username: 'ZaneRift', joinedDaysAgo: 68, avatar: 'titan' },
  { username: 'RookIron', joinedDaysAgo: 64 },
  { username: 'AshKnight', joinedDaysAgo: 60, avatar: 'drift' },
  { username: 'NovaQuill', joinedDaysAgo: 55 },
  { username: 'TalonGrey', joinedDaysAgo: 51, avatar: 'circuit' },
  { username: 'EchoSaber', joinedDaysAgo: 46 },
  { username: 'SableNine', joinedDaysAgo: 41 },
  { username: 'RiotFang', joinedDaysAgo: 36, avatar: 'titan' },
  { username: 'KiraLumen', joinedDaysAgo: 30, avatar: 'ember' },
  { username: 'HexDrift', joinedDaysAgo: 24 },
  { username: 'BlitzOrca', joinedDaysAgo: 17, avatar: 'rook' },
  { username: 'PyraVale', joinedDaysAgo: 9 },
  { username: 'GhostLark', joinedDaysAgo: 62, status: 'SUSPENDED' },
  { username: 'OnyxReef', joinedDaysAgo: 58, status: 'BANNED' },
  { username: 'VoidMarrow', joinedDaysAgo: 70, status: 'DELETED' },
  { username: 'ArloSpike', joinedDaysAgo: 0.4 },
  { username: 'FennRook', joinedDaysAgo: 0.15 },
];

const COMMENTS = [
  'That flick was disgusting 🔥', 'Clean. No notes.', 'How did you see him through the smoke?', 'GG, that read was insane',
  'Second clip was better imo', 'Lucky spray tbh', 'This needs to be on the front page', 'Teach me that peek',
  'Bro played it like a pro', 'The timing on that is unreal', 'Okay that was actually cracked', 'Rematch when?',
  'Respect, that was cold', 'My jaw dropped at 0:06', 'Calm under pressure 👏', 'Not the cannon spin-up 😭',
  'Map control was perfect', 'This is why I vote every day', 'Watched it 5 times already', 'Underrated clip',
];
const RUDE_COMMENTS = ['Uninstall the game lol', 'Trash player, reported', 'Spam spam spam follow me', 'Cheater. 100% walls.'];

// ───────────── Wipe previous demo data ─────────────

async function wipe() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DEMO_DOMAIN } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const clipIds = (await prisma.clip.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((c) => c.id);
  const battleWhere = { OR: [{ clipAId: { in: clipIds } }, { clipBId: { in: clipIds } }] };
  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { OR: [{ userId: { in: ids } }, { battle: battleWhere }] } }),
    prisma.giftTransaction.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } }),
    prisma.matchmakingTicket.deleteMany({ where: { OR: [{ userId: { in: ids } }, { clipId: { in: clipIds } }] } }),
    prisma.rematch.deleteMany({ where: { OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }] } }),
    prisma.battle.deleteMany({ where: battleWhere }),
    prisma.report.deleteMany({ where: { OR: [{ reporterId: { in: ids } }, { targetId: { in: [...ids, ...clipIds] } }] } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
    prisma.admin.deleteMany({ where: { email: { endsWith: DEMO_DOMAIN } } }),
    prisma.cosmeticItem.deleteMany({ where: { slug: { startsWith: 'avatar-demo-' } } }),
  ]);
  const demoDir = path.join(UPLOAD_ROOT, 'demo');
  if (demoDir.startsWith(UPLOAD_ROOT + path.sep)) rmSync(demoDir, { recursive: true, force: true });
  return ids.length;
}

// ───────────── Files ─────────────

function placeFile(source: string, key: string) {
  const target = path.join(UPLOAD_ROOT, key);
  mkdirSync(path.dirname(target), { recursive: true });
  try {
    linkSync(source, target); // same bytes, no extra disk space
  } catch {
    copyFileSync(source, target);
  }
}

// ───────────── Credits (ledger + balances follow the real rules) ─────────────

type CreditEvent = {
  userId: string;
  type: CreditType;
  at: Date;
  kind: 'spend' | 'purchase' | 'refund' | 'takeback';
  amount: number;
  reason: LedgerReason;
  refType?: string;
  refId?: string;
  note?: string;
};
const creditEvents: CreditEvent[] = [];

function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function writeCredits(userIds: string[], daily: Record<CreditType, number>, timeZone: string) {
  const ledger: Prisma.CreditLedgerEntryCreateManyInput[] = [];
  const balances: Prisma.CreditBalanceCreateManyInput[] = [];
  const today = localDay(NOW, timeZone);
  for (const userId of userIds) {
    for (const type of ['VOTING', 'CHALLENGE'] as const) {
      const events = creditEvents.filter((e) => e.userId === userId && e.type === type).sort((a, b) => a.at.getTime() - b.at.getTime());
      let day: string | null = null;
      let free = 0;
      let purchased = 0;
      const row = (at: Date, source: CreditSource, amount: number, reason: LedgerReason, extra: Partial<CreditEvent> = {}) =>
        ledger.push({ userId, type, source, amount, reason, refType: extra.refType, refId: extra.refId, note: extra.note, createdAt: at });
      const startDay = (at: Date) => {
        const key = localDay(at, timeZone);
        if (key === day) return;
        const grantAt = new Date(at.getTime() - 1000);
        if (free > 0) row(grantAt, 'FREE', -free, 'FREE_EXPIRED');
        day = key;
        free = daily[type];
        if (free > 0) row(grantAt, 'FREE', free, 'DAILY_ALLOWANCE');
      };
      for (const event of events) {
        if (event.kind === 'purchase') {
          purchased += event.amount;
          row(event.at, 'PURCHASED', event.amount, event.reason, event);
        } else if (event.kind === 'takeback') {
          const amount = Math.min(event.amount, purchased);
          purchased -= amount;
          if (amount > 0) row(event.at, 'PURCHASED', -amount, event.reason, event);
        } else if (event.kind === 'refund') {
          purchased += event.amount;
          row(event.at, 'PURCHASED', event.amount, event.reason, event);
        } else {
          startDay(event.at);
          if (free > 0) {
            free -= 1;
            row(event.at, 'FREE', -1, event.reason, event);
          } else {
            if (purchased === 0) {
              purchased += 5;
              row(new Date(event.at.getTime() - 500), 'PURCHASED', 5, 'ADMIN_ADJUSTMENT', { note: 'Welcome bonus' });
            }
            purchased -= 1;
            row(event.at, 'PURCHASED', -1, event.reason, event);
          }
        }
      }
      if (day !== today) startDay(ago(60_000)); // today's allowance, like opening the app today
      balances.push({ userId, type, freeBalance: free, purchasedBalance: purchased, freeResetAt: ago(60_000) });
    }
  }
  await prisma.creditLedgerEntry.createMany({ data: ledger });
  await prisma.creditBalance.createMany({ data: balances });
  return ledger.length;
}

// ───────────── Main ─────────────

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('The demo seed never runs in production.');

  const [games, gifts, packs, cosmetics, badges, superAdmin] = await Promise.all([
    prisma.game.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.gift.findMany({ where: { isActive: true, priceSar: { not: null }, popularityValue: { not: null } } }),
    prisma.creditPack.findMany({ where: { isActive: true } }),
    prisma.cosmeticItem.findMany(),
    prisma.badge.findMany(),
    prisma.admin.findFirst({ where: { role: 'SUPER_ADMIN' }, orderBy: { createdAt: 'asc' } }),
  ]);
  if (games.length === 0 || packs.length === 0 || gifts.length === 0 || !superAdmin) {
    throw new Error('Run the reference seed first: npm run db:seed');
  }
  if (!existsSync(path.join(ASSETS, 'clips', 'scope-lock.mp4'))) throw new Error(`Demo videos missing in ${ASSETS}/clips`);

  const removed = await wipe();
  if (removed) console.log(`• Removed the previous demo (${removed} players)`);

  const settings = await getSettings();
  const daily = { VOTING: settings.dailyFreeVotingCredits, CHALLENGE: settings.dailyFreeChallengeCredits };
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Admins
  const adminRows = [
    { name: 'Layla Haddad', email: `layla${DEMO_DOMAIN}`, role: 'ADMIN' as const, lastLoginAt: ago(2 * HOUR) },
    { name: 'Omar Saleh', email: `omar${DEMO_DOMAIN}`, role: 'MODERATOR' as const, lastLoginAt: ago(5 * HOUR) },
    { name: 'Sara Nasser', email: `sara${DEMO_DOMAIN}`, role: 'MODERATOR' as const, lastLoginAt: ago(20 * DAY), isActive: false },
  ];
  const admins = [];
  for (const row of adminRows) admins.push(await prisma.admin.create({ data: { ...row, passwordHash, createdAt: ago(80 * DAY) } }));
  const [layla, omar] = admins;

  // ── Avatars (ready-made profile pictures)
  for (const name of AVATARS) placeFile(path.join(ASSETS, 'avatars', `${name}.jpg`), `demo/avatars/${name}.jpg`);
  const avatarItems = [];
  for (const [index, name] of AVATARS.entries()) {
    avatarItems.push(
      await prisma.cosmeticItem.create({
        data: {
          kind: 'AVATAR',
          slug: `avatar-demo-${name}`,
          name: name[0].toUpperCase() + name.slice(1),
          isFree: true,
          priceSar: 0,
          assetUrl: fileUrl(`demo/avatars/${name}.jpg`),
          sortOrder: 100 + index,
          createdAt: ago(85 * DAY),
        },
      }),
    );
  }
  const avatarBySlug = new Map(avatarItems.map((item) => [item.slug.replace('avatar-demo-', ''), item]));

  // ── Players
  const defaults = cosmetics.filter((c) => c.isDefault && c.kind !== 'AVATAR');
  const defaultFrame = defaults.find((c) => c.kind === 'FRAME');
  const defaultTheme = defaults.find((c) => c.kind === 'THEME');
  const freeFrames = cosmetics.filter((c) => c.kind === 'FRAME' && c.isFree && c.assetUrl);
  const players: { id: string; username: string; joinedAt: Date; status: string; spec: (typeof PLAYERS)[number] }[] = [];
  for (const [index, spec] of PLAYERS.entries()) {
    const joinedAt = ago(spec.joinedDaysAgo * DAY + int(0, 6) * HOUR);
    const avatar = spec.avatar ? avatarBySlug.get(spec.avatar) : undefined;
    const frame = index % 3 === 0 && freeFrames.length > 1 ? pick(freeFrames) : defaultFrame;
    const owned = new Set([...defaults.map((c) => c.id), ...(frame ? [frame.id] : []), ...(avatar ? [avatar.id] : [])]);
    const user = await prisma.user.create({
      data: {
        username: spec.username,
        email: `${spec.username.toLowerCase()}${DEMO_DOMAIN}`,
        passwordHash,
        referralCode: `DEMO${String(index + 1).padStart(2, '0')}${spec.username.slice(0, 2).toUpperCase()}`,
        hideReferralCount: index % 4 !== 0,
        avatarUrl: avatar?.assetUrl,
        status: spec.status === 'DELETED' ? 'ACTIVE' : (spec.status ?? 'ACTIVE'),
        activeFrameId: frame?.id,
        activeThemeId: defaultTheme?.id,
        lastSeenAt: spec.status ? ago(int(3, 20) * DAY) : ago(int(5, 60 * 24) * 60_000),
        createdAt: joinedAt,
        cosmetics: { create: [...owned].map((itemId) => ({ itemId, acquiredAt: joinedAt })) },
      },
    });
    players.push({ id: user.id, username: user.username, joinedAt, status: spec.status ?? 'ACTIVE', spec });
  }
  const byName = new Map(players.map((p) => [p.username, p]));
  const P = (name: string) => byName.get(name)!;
  const canAct = (p: (typeof players)[number], at: Date) => p.joinedAt < at;
  const activeNow = players.filter((p) => p.status === 'ACTIVE');
  console.log(`• Players: ${players.length} (password ${DEMO_PASSWORD})`);

  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const note = (userId: string, type: NotificationType, at: Date, title: string, body: string, data?: Record<string, unknown>) =>
    notifications.push({ userId, type, title, body, data: data as Prisma.InputJsonValue, createdAt: at, readAt: NOW.getTime() - at.getTime() > 2 * DAY ? plus(at, int(1, 30) * HOUR) : null });

  // ── Referrals
  const popularity = new Map<string, number>();
  const popularityEvents: Prisma.PopularityEventCreateManyInput[] = [];
  const addPopularity = (userId: string, amount: number, source: 'GIFT' | 'REFERRAL' | 'ADMIN_ADJUSTMENT', at: Date, refId?: string) => {
    popularity.set(userId, (popularity.get(userId) ?? 0) + amount);
    popularityEvents.push({ userId, amount, source, refId, createdAt: at });
  };
  const referralPairs: [string, string][] = [['ShadowVex', 'MiraPulse'], ['ShadowVex', 'ZaneRift'], ['NyxRaider', 'NovaQuill'], ['KaiStorm', 'SableNine'], ['ShadowVex', 'PyraVale'], ['JunoBlaze', 'ArloSpike']];
  for (const [inviterName, inviteeName] of referralPairs) {
    const inviter = P(inviterName);
    const invitee = P(inviteeName);
    await prisma.referral.create({ data: { inviterId: inviter.id, inviteeId: invitee.id, pointsAwarded: settings.referralPopularityPoints, createdAt: invitee.joinedAt } });
    addPopularity(inviter.id, settings.referralPopularityPoints, 'REFERRAL', invitee.joinedAt, invitee.id);
    note(inviter.id, 'FRIEND_JOINED', invitee.joinedAt, 'A friend joined', `${invitee.username} joined VALOR with your invite link (+${settings.referralPopularityPoints} popularity).`, { userId: invitee.id });
  }

  // ── Clips
  let videoCursor = 0;
  type ClipRow = { id: string; userId: string; gameId: string; title: string; createdAt: Date; video: string };
  const clips: ClipRow[] = [];
  async function makeClip(userId: string, gameId: string, createdAt: Date, extra: Partial<Prisma.ClipUncheckedCreateInput> = {}) {
    const video = VIDEO_NAMES[videoCursor++ % VIDEO_NAMES.length];
    const id = randomUUID().replace(/-/g, '').slice(0, 25);
    const videoKey = `demo/clips/${id}.mp4`;
    const thumbnailKey = `demo/thumbs/${id}.jpg`;
    placeFile(path.join(ASSETS, 'clips', `${video}.mp4`), videoKey);
    placeFile(path.join(ASSETS, 'clips', `${video}.jpg`), thumbnailKey);
    const title = pick(VIDEOS[video]);
    await prisma.clip.create({
      data: { id, userId, gameId, title, description: chance(0.5) ? `${pick(['Ranked', 'Scrims', 'Late night', 'Tournament qualifier', 'Duo queue'])} · ${pick(['no comms', 'last round', 'match point', 'first try', 'overtime'])}` : null, videoKey, thumbnailKey, durationSec: 10, status: 'READY', createdAt, ...extra },
    });
    const row = { id, userId, gameId, title, createdAt, video };
    clips.push(row);
    return row;
  }

  // ── Battles
  const criteria = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)!;
    const c = (game.criteria ?? {}) as { weaponClasses?: string[]; ranks?: string[] };
    return { weaponClass: pick(c.weaponClasses?.length ? c.weaponClasses : ['Any']), rank: pick(c.ranks?.length ? c.ranks : ['Any']) };
  };
  type BattleRow = { id: string; status: 'ACTIVE' | 'CLOSED' | 'CANCELLED'; a: ClipRow; b: ClipRow; start: Date; end: Date; closedAt: Date | null; winner: BattleSide | null; votes: { userId: string; side: BattleSide; at: Date }[] };
  const battles: BattleRow[] = [];
  const pairCount = new Map<string, number>();
  const pairKey = (x: string, y: string) => [x, y].sort().join(':');

  async function makeBattle(status: BattleRow['status'], start: Date, aUser?: string, bUser?: string, options: { winnerBias?: BattleSide; forceVotes?: number } = {}) {
    const pool = players.filter((p) => canAct(p, plus(start, -DAY)) && (status !== 'ACTIVE' || p.status === 'ACTIVE') && p.spec.status !== 'DELETED');
    const a = aUser ? P(aUser) : pick(pool);
    const candidates = pool.filter((p) => p.id !== a.id && (pairCount.get(pairKey(a.id, p.id)) ?? 0) < 2);
    const b = bUser ? P(bUser) : pick(candidates);
    pairCount.set(pairKey(a.id, b.id), (pairCount.get(pairKey(a.id, b.id)) ?? 0) + 1);
    const gameId = pick(games).id;
    const { weaponClass, rank } = criteria(gameId);
    const entryA = plus(start, -int(10, 300) * 60_000);
    const entryB = plus(start, -int(1, 9) * 60_000);
    const clipA = await makeClip(a.id, gameId, plus(entryA, -int(5, 120) * 60_000));
    const clipB = await makeClip(b.id, gameId, plus(entryB, -int(5, 120) * 60_000));
    const end = plus(start, settings.votingDurationHours * HOUR);
    const battle = await prisma.battle.create({ data: { gameId, clipAId: clipA.id, clipBId: clipB.id, status: 'ACTIVE', votingStartsAt: start, votingEndsAt: end, createdAt: start } });

    for (const [clip, enteredAt] of [[clipA, entryA], [clipB, entryB]] as const) {
      const ticket = await prisma.matchmakingTicket.create({
        data: { userId: clip.userId, clipId: clip.id, gameId, weaponClass, rank, status: 'MATCHED', battleId: battle.id, matchedAt: start, expiresAt: plus(enteredAt, settings.matchmakingTimeoutMinutes * 60_000), createdAt: enteredAt },
      });
      creditEvents.push({ userId: clip.userId, type: 'CHALLENGE', at: enteredAt, kind: 'spend', amount: 1, reason: 'BATTLE_ENTRY', refType: 'ticket', refId: ticket.id });
      note(clip.userId, 'MATCH_FOUND', start, 'Opponent found', `"${clip.title}" is now in a blind battle. Voting is open for ${settings.votingDurationHours} hours.`, { battleId: battle.id });
      if (status === 'CANCELLED') {
        creditEvents.push({ userId: clip.userId, type: 'CHALLENGE', at: plus(start, 3 * HOUR), kind: 'refund', amount: 1, reason: 'MATCHMAKING_REFUND', refType: 'ticket', refId: ticket.id, note: 'Battle cancelled: reported clip removed' });
      }
    }

    // Votes from other players
    const lastVoteAt = status === 'ACTIVE' ? NOW : status === 'CANCELLED' ? plus(start, 3 * HOUR) : end;
    const voters = shuffle(players.filter((p) => p.id !== a.id && p.id !== b.id && p.spec.status !== 'DELETED' && canAct(p, start))).slice(0, options.forceVotes ?? (status === 'ACTIVE' ? int(0, 9) : status === 'CANCELLED' ? int(1, 4) : int(3, 14)));
    const bias = options.winnerBias ?? (chance(0.5) ? 'A' : 'B');
    const votes = voters.map((v) => ({ userId: v.id, side: (chance(0.66) ? bias : bias === 'A' ? 'B' : 'A') as BattleSide, at: between(start, lastVoteAt) }));
    if (votes.length) await prisma.vote.createMany({ data: votes.map((v) => ({ battleId: battle.id, userId: v.userId, side: v.side, createdAt: v.at })) });
    for (const v of votes) {
      creditEvents.push({ userId: v.userId, type: 'VOTING', at: v.at, kind: 'spend', amount: 1, reason: 'VOTE', refType: 'battle', refId: battle.id });
      if (status === 'CANCELLED') creditEvents.push({ userId: v.userId, type: 'VOTING', at: plus(start, 3 * HOUR), kind: 'refund', amount: 1, reason: 'ADMIN_ADJUSTMENT', refType: 'battle', refId: battle.id, note: 'Battle cancelled: reported clip removed' });
    }
    const votesA = votes.filter((v) => v.side === 'A').length;
    const votesB = votes.length - votesA;
    const winner: BattleSide | null = status !== 'CLOSED' || votesA === votesB ? null : votesA > votesB ? 'A' : 'B';
    const closedAt = status === 'CLOSED' ? end : status === 'CANCELLED' ? plus(start, 3 * HOUR) : null;
    await prisma.battle.update({ where: { id: battle.id }, data: { status, votesA, votesB, winnerSide: winner, closedAt } });

    if (status === 'CLOSED') {
      const total = votesA + votesB;
      for (const side of ['A', 'B'] as const) {
        const clip = side === 'A' ? clipA : clipB;
        const mine = side === 'A' ? votesA : votesB;
        const percent = total ? Math.round((mine / total) * 100) : 50;
        const result = winner === null ? 'draw' : winner === side ? 'won' : 'lost';
        note(clip.userId, 'BATTLE_RESULT', end, result === 'won' ? 'You won the battle!' : result === 'lost' ? 'Battle finished' : "It's a draw", `"${clip.title}" got ${percent}% of the final vote.`, { battleId: battle.id, result });
      }
    }
    if (status === 'CANCELLED') {
      for (const clip of [clipA, clipB]) note(clip.userId, 'BATTLE_CANCELLED', plus(start, 3 * HOUR), 'Battle cancelled', 'A battle you were in was cancelled by VALOR. Your Challenge Credit was refunded.', { battleId: battle.id });
    }
    const row: BattleRow = { id: battle.id, status, a: clipA, b: clipB, start, end, closedAt, winner, votes };
    battles.push(row);
    return row;
  }

  // Finished battles over the last two months, live ones right now, two cancelled.
  for (let i = 0; i < 26; i++) await makeBattle('CLOSED', ago((62 - i * 2.3) * DAY - int(0, 10) * HOUR));
  const rematchOriginal = await makeBattle('CLOSED', ago(2 * DAY), 'KaiStorm', 'NyxRaider', { winnerBias: 'B', forceVotes: 9 });
  const pendingOriginal = await makeBattle('CLOSED', ago(30 * HOUR), 'DexHollow', 'ShadowVex', { winnerBias: 'B', forceVotes: 7 });
  const declinedOriginal = await makeBattle('CLOSED', ago(20 * DAY), 'LyraVolt', 'JunoBlaze', { winnerBias: 'B', forceVotes: 9 });
  const expiredOriginal = await makeBattle('CLOSED', ago(14 * DAY), 'EchoSaber', 'OrinFrost', { winnerBias: 'B', forceVotes: 7 });
  await makeBattle('CLOSED', ago(40 * DAY), 'VoidMarrow', 'RookIron', { winnerBias: 'A', forceVotes: 5 });
  await makeBattle('CLOSED', ago(33 * DAY), 'GhostLark', 'AshKnight', { forceVotes: 6 });
  await makeBattle('CLOSED', ago(27 * DAY), 'OnyxReef', 'TalonGrey', { forceVotes: 6 });
  const cancelledA = await makeBattle('CANCELLED', ago(31 * DAY));
  await makeBattle('CANCELLED', ago(8 * DAY));
  for (const hoursIn of [1, 3, 7, 12, 18, 22.5]) await makeBattle('ACTIVE', ago(hoursIn * HOUR));
  const rematchBattle = await makeBattle('ACTIVE', ago(5 * HOUR), 'KaiStorm', 'NyxRaider', { forceVotes: 4 });

  // ── Rematches (the loser challenges the winner with new clips)
  const loserOf = (b: BattleRow) => (b.winner === 'A' ? b.b : b.a);
  const winnerOf = (b: BattleRow) => (b.winner === 'A' ? b.a : b.b);
  const rematchFee = (userId: string, at: Date, rematchId: string) =>
    creditEvents.push({ userId, type: 'CHALLENGE', at, kind: 'spend', amount: 1, reason: 'BATTLE_ENTRY', refType: 'rematch', refId: rematchId });
  const rematchSpecs: { original: BattleRow; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' }[] = [
    { original: rematchOriginal, status: 'ACCEPTED' },
    { original: pendingOriginal, status: 'PENDING' },
    { original: declinedOriginal, status: 'DECLINED' },
    { original: expiredOriginal, status: 'EXPIRED' },
  ];
  for (const { original, status } of rematchSpecs) {
    if (!original.winner) continue;
    const challenger = loserOf(original);
    const opponent = winnerOf(original);
    const createdAt = plus(original.end, int(1, 6) * HOUR);
    const challengerClip = status === 'ACCEPTED' ? (rematchBattle.a.userId === challenger.userId ? rematchBattle.a : rematchBattle.b) : await makeClip(challenger.userId, original.a.gameId, plus(createdAt, -10 * 60_000));
    const opponentClip = status === 'ACCEPTED' ? (rematchBattle.a.userId === opponent.userId ? rematchBattle.a : rematchBattle.b) : null;
    const respondedAt = status === 'ACCEPTED' ? rematchBattle.start : status === 'DECLINED' ? plus(createdAt, 3 * HOUR) : null;
    const rematch = await prisma.rematch.create({
      data: {
        originalBattleId: original.id,
        challengerId: challenger.userId,
        opponentId: opponent.userId,
        challengerClipId: challengerClip.id,
        opponentClipId: opponentClip?.id,
        battleId: status === 'ACCEPTED' ? rematchBattle.id : null,
        status,
        expiresAt: plus(createdAt, settings.rematchAcceptHours * HOUR),
        respondedAt,
        createdAt,
      },
    });
    const challengerName = players.find((p) => p.id === challenger.userId)!.username;
    const opponentName = players.find((p) => p.id === opponent.userId)!.username;
    rematchFee(challenger.userId, createdAt, rematch.id);
    note(opponent.userId, 'REMATCH_REQUESTED', createdAt, 'Rematch requested', `${challengerName} wants a rematch. You have ${settings.rematchAcceptHours} hours to accept.`, { rematchId: rematch.id });
    if (status === 'ACCEPTED') {
      rematchFee(opponent.userId, respondedAt!, rematch.id);
      note(challenger.userId, 'REMATCH_ACCEPTED', respondedAt!, 'Rematch accepted', `${opponentName} accepted. The new battle is live.`, { rematchId: rematch.id, battleId: rematchBattle.id });
    }
    if (status === 'DECLINED') {
      creditEvents.push({ userId: challenger.userId, type: 'CHALLENGE', at: respondedAt!, kind: 'refund', amount: 1, reason: 'MATCHMAKING_REFUND', refType: 'rematch', refId: rematch.id });
      note(challenger.userId, 'REMATCH_DECLINED', respondedAt!, 'Rematch declined', `${opponentName} declined the rematch. Your Challenge Credit was refunded.`, { rematchId: rematch.id });
    }
    if (status === 'EXPIRED') {
      const at = plus(createdAt, settings.rematchAcceptHours * HOUR);
      creditEvents.push({ userId: challenger.userId, type: 'CHALLENGE', at, kind: 'refund', amount: 1, reason: 'MATCHMAKING_REFUND', refType: 'rematch', refId: rematch.id });
      note(challenger.userId, 'REMATCH_EXPIRED', at, 'Rematch expired', `${opponentName} didn't answer in time. Your Challenge Credit was refunded.`, { rematchId: rematch.id });
    }
  }
  // The admin team awards "King of Revenge" by hand (its rules are pending).
  const kingOfRevenge = badges.find((b) => b.slug === 'king-of-revenge');

  // ── Battle entries waiting for an opponent (different criteria, so they don't match each other)
  const usedCombos = new Set<string>();
  const waitingPlayers = ['ZaneRift', 'KiraLumen', 'BlitzOrca', 'HexDrift'];
  for (const [index, name] of waitingPlayers.entries()) {
    const game = games[index % games.length];
    let combo = criteria(game.id);
    while (usedCombos.has(`${game.id}:${combo.weaponClass}:${combo.rank}`)) combo = criteria(game.id);
    usedCombos.add(`${game.id}:${combo.weaponClass}:${combo.rank}`);
    const enteredAt = ago(int(3, 90) * 60_000);
    const clip = await makeClip(P(name).id, game.id, plus(enteredAt, -5 * 60_000));
    const ticket = await prisma.matchmakingTicket.create({ data: { userId: P(name).id, clipId: clip.id, gameId: game.id, ...combo, status: 'QUEUED', expiresAt: plus(enteredAt, settings.matchmakingTimeoutMinutes * 60_000), createdAt: enteredAt } });
    creditEvents.push({ userId: P(name).id, type: 'CHALLENGE', at: enteredAt, kind: 'spend', amount: 1, reason: 'BATTLE_ENTRY', refType: 'ticket', refId: ticket.id });
  }
  for (const [name, status, daysAgo] of [['MiraPulse', 'EXPIRED', 12], ['NovaQuill', 'EXPIRED', 5], ['SableNine', 'CANCELLED', 9]] as const) {
    const game = pick(games);
    const enteredAt = ago(daysAgo * DAY);
    const clip = await makeClip(P(name).id, game.id, plus(enteredAt, -5 * 60_000));
    const endedAt = status === 'EXPIRED' ? plus(enteredAt, settings.matchmakingTimeoutMinutes * 60_000) : plus(enteredAt, 2 * HOUR);
    const ticket = await prisma.matchmakingTicket.create({ data: { userId: P(name).id, clipId: clip.id, gameId: game.id, ...criteria(game.id), status, expiresAt: plus(enteredAt, settings.matchmakingTimeoutMinutes * 60_000), createdAt: enteredAt } });
    creditEvents.push({ userId: P(name).id, type: 'CHALLENGE', at: enteredAt, kind: 'spend', amount: 1, reason: 'BATTLE_ENTRY', refType: 'ticket', refId: ticket.id });
    creditEvents.push({ userId: P(name).id, type: 'CHALLENGE', at: endedAt, kind: 'refund', amount: 1, reason: 'MATCHMAKING_REFUND', refType: 'ticket', refId: ticket.id });
    if (status === 'EXPIRED') note(P(name).id, 'ENTRY_EXPIRED', endedAt, 'No opponent found', `"${clip.title}" didn't find an opponent in time. Your Challenge Credit was refunded.`, { ticketId: ticket.id });
  }

  // ── Gallery clips (published outside battles)
  for (const p of players.filter((x) => x.spec.status !== 'DELETED' && x.spec.joinedDaysAgo > 0.3)) {
    for (let i = 0; i < int(1, 2); i++) await makeClip(p.id, pick(games).id, between(plus(p.joinedAt, HOUR), ago(2 * HOUR)));
  }
  await makeClip(P('ArloSpike').id, games[0].id, ago(2 * HOUR)); // a brand-new player's first post

  // Clips that are anonymous right now (live battle or waiting) get no likes/comments.
  const hidden = new Set<string>([
    ...battles.filter((b) => b.status === 'ACTIVE').flatMap((b) => [b.a.id, b.b.id]),
    ...(await prisma.matchmakingTicket.findMany({ where: { status: 'QUEUED' }, select: { clipId: true } })).map((t) => t.clipId),
  ]);
  const publicClips = clips.filter((c) => !hidden.has(c.id));

  // ── Likes & comments
  const actors = players.filter((p) => p.spec.status !== 'DELETED');
  const likes: Prisma.ClipLikeCreateManyInput[] = [];
  const comments: { id: string; clipId: string; userId: string; body: string; status: 'VISIBLE' | 'REMOVED'; createdAt: Date }[] = [];
  for (const clip of publicClips) {
    const fans = shuffle(actors.filter((p) => p.id !== clip.userId && canAct(p, NOW))).slice(0, int(0, 14));
    for (const fan of fans) likes.push({ userId: fan.id, clipId: clip.id, createdAt: between(clip.createdAt, NOW) });
    const commenters = shuffle(actors.filter((p) => p.id !== clip.userId)).slice(0, int(0, 4));
    for (const c of commenters) comments.push({ id: randomUUID().replace(/-/g, '').slice(0, 25), clipId: clip.id, userId: c.id, body: pick(COMMENTS), status: 'VISIBLE', createdAt: between(clip.createdAt, NOW) });
  }
  const rudeAuthors = [P('OnyxReef'), P('GhostLark'), P('RiotFang'), P('HexDrift')];
  for (const [i, body] of RUDE_COMMENTS.entries()) {
    const clip = pick(publicClips.filter((c) => c.userId !== rudeAuthors[i].id));
    comments.push({ id: randomUUID().replace(/-/g, '').slice(0, 25), clipId: clip.id, userId: rudeAuthors[i].id, body, status: i < 2 ? 'REMOVED' : 'VISIBLE', createdAt: between(plus(clip.createdAt, HOUR), ago(6 * HOUR)) });
  }
  await prisma.clipLike.createMany({ data: likes, skipDuplicates: true });
  await prisma.comment.createMany({ data: comments });
  for (const clip of publicClips) {
    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        likesCount: likes.filter((l) => l.clipId === clip.id).length,
        commentsCount: comments.filter((c) => c.clipId === clip.id && c.status === 'VISIBLE').length,
      },
    });
  }

  // ── Store: credit packs and gifts (purchases go through the real stores in production)
  const purchases: Prisma.PurchaseCreateManyInput[] = [];
  const providers = ['APP_STORE', 'PLAY_STORE'] as const;
  const buyers = players.filter((p) => p.spec.status !== 'DELETED');
  for (let i = 0; i < 46; i++) {
    const buyer = pick(buyers);
    const at = between(plus(buyer.joinedAt, HOUR), ago(HOUR));
    const pack = pick(packs);
    const status = i % 17 === 5 ? 'FAILED' : i === 9 ? 'REFUNDED' : i === 44 ? 'PENDING' : 'COMPLETED';
    const id = randomUUID().replace(/-/g, '').slice(0, 25);
    purchases.push({ id, userId: buyer.id, provider: pick(providers), storeTransactionId: `demo-${id}`, storeProductId: pack.storeProductId, kind: 'CREDIT_PACK', refId: pack.id, quantity: 1, priceSar: pack.priceSar, status, rawPayload: { demo: true }, createdAt: at });
    if (status === 'COMPLETED' || status === 'REFUNDED') creditEvents.push({ userId: buyer.id, type: pack.type, at, kind: 'purchase', amount: pack.credits, reason: 'PURCHASE', refType: 'purchase', refId: id });
    if (status === 'REFUNDED') creditEvents.push({ userId: buyer.id, type: pack.type, at: plus(at, 2 * DAY), kind: 'takeback', amount: pack.credits, reason: 'ADMIN_ADJUSTMENT', refType: 'purchase', refId: id, note: 'Refund: accidental purchase' });
  }

  const giftRows: Prisma.GiftTransactionCreateManyInput[] = [];
  const giftNotify = (recipientId: string, at: Date, giftName: string, quantity: number, popularityAwarded: number, data: Record<string, unknown>) =>
    note(recipientId, 'GIFT_RECEIVED', at, 'You received a gift', `Someone sent you ${quantity > 1 ? `${quantity}× ` : ''}${giftName} (+${popularityAwarded} popularity).`, data);
  const sendGift = (sender: (typeof players)[number], recipientId: string, at: Date, target: { battle?: BattleRow; side?: BattleSide; clipId?: string }, gift = pick(gifts.filter((g) => g.slug !== 'legend'))) => {
    const quantity = gift.slug === 'legend' ? 1 : pick([1, 1, 1, 2, 3]);
    const purchaseId = randomUUID().replace(/-/g, '').slice(0, 25);
    const unit = gift.priceSar!;
    purchases.push({ id: purchaseId, userId: sender.id, provider: pick(providers), storeTransactionId: `demo-${purchaseId}`, storeProductId: gift.storeProductId ?? `valor.gift.${gift.slug}`, kind: 'GIFT', refId: gift.id, quantity, priceSar: new Prisma.Decimal(unit).mul(quantity), status: 'COMPLETED', rawPayload: { demo: true }, createdAt: at });
    const popularityAwarded = gift.popularityValue! * quantity;
    const live = target.battle?.status === 'ACTIVE';
    const awardedAt = target.battle ? (live ? null : (target.battle.closedAt ?? at)) : at;
    const id = randomUUID().replace(/-/g, '').slice(0, 25);
    giftRows.push({ id, giftId: gift.id, senderId: sender.id, recipientId, battleId: target.battle?.id, battleSide: target.side, clipId: target.clipId ?? (target.battle ? (target.side === 'A' ? target.battle.a.id : target.battle.b.id) : undefined), purchaseId, quantity, unitPriceSar: unit, popularityAwarded, awardedAt, createdAt: at });
    if (awardedAt) {
      addPopularity(recipientId, popularityAwarded, 'GIFT', awardedAt, id);
      giftNotify(recipientId, awardedAt, gift.name, quantity, popularityAwarded, target.battle ? { battleId: target.battle.id } : { clipId: target.clipId });
    }
  };
  for (const battle of battles.filter((b) => b.status !== 'CANCELLED')) {
    for (let i = 0; i < int(0, 3); i++) {
      const side: BattleSide = chance(0.5) ? 'A' : 'B';
      const clip = side === 'A' ? battle.a : battle.b;
      const sender = pick(actors.filter((p) => p.id !== battle.a.userId && p.id !== battle.b.userId && canAct(p, battle.start)));
      sendGift(sender, clip.userId, between(battle.start, battle.status === 'ACTIVE' ? NOW : battle.end), { battle, side });
    }
  }
  for (let i = 0; i < 22; i++) {
    const clip = pick(publicClips);
    const sender = pick(actors.filter((p) => p.id !== clip.userId));
    sendGift(sender, clip.userId, between(clip.createdAt, NOW), { clipId: clip.id });
  }
  const legend = gifts.find((g) => g.slug === 'legend');
  if (legend) {
    const clip = clips.find((c) => c.userId === P('ShadowVex').id && !hidden.has(c.id))!;
    sendGift(P('KaiStorm'), clip.userId, ago(4 * DAY), { clipId: clip.id }, legend);
  }
  await prisma.purchase.createMany({ data: purchases });
  await prisma.giftTransaction.createMany({ data: giftRows });

  // ── Blocks (pairs that never battled each other)
  const blockPairs: [string, string][] = [['JunoBlaze', 'OnyxReef'], ['MiraPulse', 'GhostLark'], ['PyraVale', 'RiotFang']];
  for (const [blocker, blocked] of blockPairs) {
    if (pairCount.has(pairKey(P(blocker).id, P(blocked).id))) continue;
    await prisma.userBlock.create({ data: { blockerId: P(blocker).id, blockedId: P(blocked).id, createdAt: ago(int(2, 20) * DAY) } });
  }

  // ── Reports
  const reportRows: Prisma.ReportCreateManyInput[] = [];
  const report = (reporter: string, targetType: ReportTarget, targetId: string, reason: string, status: ReportStatus, at: Date, resolution?: string) =>
    reportRows.push({
      reporterId: P(reporter).id,
      targetType,
      targetId,
      reason,
      status,
      createdAt: at,
      resolvedById: status === 'OPEN' ? null : pick([layla.id, omar.id]),
      resolvedAt: status === 'OPEN' ? null : plus(at, int(1, 12) * HOUR),
      resolutionNote: resolution ?? null,
    });
  const rude = comments.filter((c) => RUDE_COMMENTS.includes(c.body));
  report('JunoBlaze', 'COMMENT', rude[0].id, 'Toxic, telling people to quit', 'RESOLVED', plus(rude[0].createdAt, HOUR), 'Comment removed.');
  report('MiraPulse', 'COMMENT', rude[1].id, 'Harassment', 'RESOLVED', plus(rude[1].createdAt, HOUR), 'Comment removed, player warned.');
  report('KaiStorm', 'COMMENT', rude[2].id, 'Spam', 'OPEN', plus(rude[2].createdAt, 2 * HOUR));
  report('LyraVolt', 'COMMENT', rude[3].id, 'Accusing me of cheating', 'OPEN', plus(rude[3].createdAt, HOUR));
  report('ShadowVex', 'USER', P('OnyxReef').id, 'Spamming every clip with insults', 'RESOLVED', ago(30 * DAY), 'Account banned after repeated warnings.');
  report('AshKnight', 'USER', P('GhostLark').id, 'Harassing in comments and DMs', 'RESOLVED', ago(9 * DAY), 'Suspended for 14 days.');
  report('NovaQuill', 'USER', P('RiotFang').id, 'Offensive username?', 'DISMISSED', ago(18 * DAY), 'Username is fine.');
  report('TalonGrey', 'USER', P('HexDrift').id, 'Keeps asking for votes in comments', 'OPEN', ago(10 * HOUR));
  report('OrinFrost', 'CLIP', cancelledA.a.id, 'Not from this game, looks edited', 'RESOLVED', plus(cancelledA.start, HOUR), 'Clip removed; live battle cancelled and refunded.');
  const suspicious = pick(publicClips.filter((c) => c.userId !== P('DexHollow').id));
  report('DexHollow', 'CLIP', suspicious.id, 'This is footage from a movie, not gameplay', 'OPEN', ago(3 * HOUR));
  const dismissed = pick(publicClips);
  report(players.find((p) => p.id !== dismissed.userId && p.spec.status !== 'DELETED')!.username, 'CLIP', dismissed.id, 'Wrong game selected', 'DISMISSED', ago(6 * DAY), 'Game is correct.');
  await prisma.report.createMany({ data: reportRows });

  // The reported clip that was removed (its live battle was cancelled).
  await prisma.clip.update({ where: { id: cancelledA.a.id }, data: { status: 'REMOVED', removedAt: plus(cancelledA.start, 3 * HOUR) } });
  await prisma.clip.update({ where: { id: pick(publicClips.filter((c) => c.userId === P('OnyxReef').id)).id }, data: { status: 'REMOVED', removedAt: ago(30 * DAY) } }).catch(() => undefined);

  // ── Popularity totals
  await prisma.popularityEvent.createMany({ data: popularityEvents });
  for (const [userId, total] of popularity) await prisma.user.update({ where: { id: userId }, data: { popularity: total } });

  // ── Announcements
  const recipients = activeNow;
  const announcementSpecs = [
    { title: 'Season 1 is live 🔥', body: 'New frames, new themes and double popularity on every gift this weekend. Jump into a battle!', at: ago(12 * DAY), by: layla },
    { title: 'Fair play reminder', body: 'Only upload your own gameplay. Edited or stolen clips are removed and live battles are cancelled.', at: ago(4 * DAY), by: omar },
  ];
  for (const spec of announcementSpecs) {
    await prisma.announcement.create({ data: { title: spec.title, body: spec.body, audience: 'ALL', recipients: recipients.filter((p) => p.joinedAt < spec.at).length, createdById: spec.by.id, createdAt: spec.at } });
    for (const p of recipients.filter((x) => x.joinedAt < spec.at)) note(p.id, 'ANNOUNCEMENT', spec.at, spec.title, spec.body);
  }
  const warned = P('HexDrift');
  await prisma.announcement.create({ data: { title: 'About vote requests', body: "Please don't ask for votes in comments. Next time the comments will be removed.", audience: 'PLAYER', userId: warned.id, recipients: 1, createdById: omar.id, createdAt: ago(8 * HOUR) } });
  note(warned.id, 'ANNOUNCEMENT', ago(8 * HOUR), 'About vote requests', "Please don't ask for votes in comments. Next time the comments will be removed.");

  // ── Credits
  const ledgerRows = await writeCredits(players.map((p) => p.id), daily, settings.dailyResetTimezone);

  // ── Deleted account (anonymized the same way as the real deletion; the finished battle stays)
  const deleted = P('VoidMarrow');
  await prisma.clip.updateMany({ where: { userId: deleted.id }, data: { status: 'REMOVED', removedAt: ago(20 * DAY) } });
  await prisma.userCosmetic.deleteMany({ where: { userId: deleted.id } });
  await prisma.creditBalance.deleteMany({ where: { userId: deleted.id } });
  await prisma.user.update({
    where: { id: deleted.id },
    data: { status: 'DELETED', deletedAt: ago(20 * DAY), username: `deleted_${deleted.id.slice(-6)}`, email: `deleted+${deleted.id}${DEMO_DOMAIN}`, passwordHash: null, avatarUrl: null, bannerUrl: null, activeFrameId: null, activeThemeId: null },
  });
  notifications.splice(0, notifications.length, ...notifications.filter((n) => n.userId !== deleted.id));

  await prisma.notification.createMany({ data: notifications });

  // ── Badges: automatic rules (real code) + one awarded by an admin
  for (const p of players.filter((x) => x.spec.status !== 'DELETED')) await checkBadges(p.id);
  if (kingOfRevenge) {
    await prisma.userBadge.create({ data: { userId: P('ShadowVex').id, badgeId: kingOfRevenge.id, awardedById: layla.id, earnedAt: ago(DAY) } });
    await prisma.notification.create({ data: { userId: P('ShadowVex').id, type: 'BADGE_EARNED', title: 'Badge earned', body: 'You earned the King of Revenge badge.', data: { badgeId: kingOfRevenge.id }, createdAt: ago(DAY) } });
  }

  // ── Admin activity log (matches the moderation above)
  const auditRows: Prisma.AdminAuditLogCreateManyInput[] = [
    { adminId: layla.id, action: 'player.status.banned', entityType: 'player', entityId: P('OnyxReef').id, summary: 'Set OnyxReef to BANNED', createdAt: ago(30 * DAY) },
    { adminId: omar.id, action: 'player.status.suspended', entityType: 'player', entityId: P('GhostLark').id, summary: 'Set GhostLark to SUSPENDED', createdAt: ago(9 * DAY) },
    { adminId: omar.id, action: 'comment.remove', entityType: 'comment', entityId: rude[0].id, summary: 'Removed a comment by OnyxReef', createdAt: plus(rude[0].createdAt, 3 * HOUR) },
    { adminId: omar.id, action: 'comment.remove', entityType: 'comment', entityId: rude[1].id, summary: 'Removed a comment by GhostLark', createdAt: plus(rude[1].createdAt, 3 * HOUR) },
    { adminId: layla.id, action: 'clip.remove', entityType: 'clip', entityId: cancelledA.a.id, summary: `Removed clip "${cancelledA.a.title}"`, details: { reason: 'Not gameplay from this game' }, createdAt: plus(cancelledA.start, 3 * HOUR) },
    { adminId: layla.id, action: 'battle.cancel', entityType: 'battle', entityId: cancelledA.id, summary: 'Cancelled a live battle (refunded everyone)', createdAt: plus(cancelledA.start, 3 * HOUR) },
    { adminId: layla.id, action: 'announcement.send', entityType: 'announcement', summary: 'Sent "Season 1 is live 🔥" to all players', createdAt: ago(12 * DAY) },
    { adminId: omar.id, action: 'announcement.send', entityType: 'announcement', summary: 'Sent "Fair play reminder" to all players', createdAt: ago(4 * DAY) },
    { adminId: omar.id, action: 'announcement.send', entityType: 'announcement', summary: 'Sent "About vote requests" to HexDrift', createdAt: ago(8 * HOUR) },
    { adminId: layla.id, action: 'player.badge.award', entityType: 'player', entityId: P('ShadowVex').id, summary: 'Awarded King of Revenge to ShadowVex', createdAt: ago(DAY) },
  ];
  const refunded = purchases.find((p) => p.status === 'REFUNDED');
  if (refunded) auditRows.push({ adminId: layla.id, action: 'purchase.refund', entityType: 'purchase', entityId: refunded.id!, summary: 'Refunded a credit pack purchase', details: { reason: 'Accidental purchase' }, createdAt: plus(refunded.createdAt as Date, 2 * DAY) });
  await prisma.adminAuditLog.createMany({ data: auditRows });

  const counts = await Promise.all([
    prisma.clip.count({ where: { userId: { in: players.map((p) => p.id) } } }),
    prisma.battle.groupBy({ by: ['status'], _count: { _all: true }, where: { id: { in: battles.map((b) => b.id) } } }),
    prisma.vote.count({ where: { battleId: { in: battles.map((b) => b.id) } } }),
  ]);
  console.log(`• Clips: ${counts[0]} (14 real videos, ${new Set(clips.map((c) => c.video)).size} used)`);
  console.log(`• Battles: ${counts[1].map((g) => `${g._count._all} ${g.status.toLowerCase()}`).join(', ')} · votes ${counts[2]}`);
  console.log(`• Store: ${purchases.length} purchases, ${giftRows.length} gifts · credit ledger rows ${ledgerRows}`);
  console.log(`• Moderation: ${reportRows.length} reports, ${comments.length} comments, ${likes.length} likes`);
  console.log(`• Notifications: ${notifications.length}+ · admins: layla / omar / sara${DEMO_DOMAIN} (password ${DEMO_PASSWORD})`);
}

main()
  .then(() => console.log('Demo seed complete'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
