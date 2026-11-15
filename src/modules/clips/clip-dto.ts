import type { Prisma } from '@prisma/client';
import { storage } from '../../lib/storage';
import { playerSummarySelect } from '../users/player-select';

/**
 * A clip is "live" while it waits for an opponent or is in a battle that is still voting.
 * Live clips are hidden from everyone except their owner, so a battle stays anonymous.
 */
export const liveClipWhere: Prisma.ClipWhereInput = {
  OR: [
    { tickets: { some: { status: 'QUEUED' } } },
    { battlesAsA: { some: { status: 'ACTIVE' } } },
    { battlesAsB: { some: { status: 'ACTIVE' } } },
  ],
};

export const publicClipWhere: Prisma.ClipWhereInput = { status: 'READY', NOT: liveClipWhere };

const latestBattleSelect = { id: true, status: true, winnerSide: true, createdAt: true } satisfies Prisma.BattleSelect;

export const clipInclude = {
  game: { select: { id: true, slug: true, name: true } },
  user: { select: playerSummarySelect },
  tickets: { where: { status: 'QUEUED' }, select: { id: true }, take: 1 },
  // The clip's latest live or finished battle: live → hidden/flagged, finished → result badge.
  battlesAsA: { where: { status: { in: ['ACTIVE', 'CLOSED'] } }, select: latestBattleSelect, orderBy: { createdAt: 'desc' }, take: 1 },
  battlesAsB: { where: { status: { in: ['ACTIVE', 'CLOSED'] } }, select: latestBattleSelect, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ClipInclude;

export type ClipWithRelations = Prisma.ClipGetPayload<{ include: typeof clipInclude }>;

export function toClipDto(clip: ClipWithRelations, extra: { likedByMe?: boolean } = {}) {
  const activeBattle = activeBattleOf(clip);
  const result = battleResultOf(clip);
  return {
    id: clip.id,
    title: clip.title,
    description: clip.description,
    durationSec: clip.durationSec,
    status: clip.status,
    videoUrl: storage.url(clip.videoKey),
    thumbnailUrl: storage.url(clip.thumbnailKey),
    likesCount: clip.likesCount,
    commentsCount: clip.commentsCount,
    createdAt: clip.createdAt,
    game: clip.game,
    owner: clip.user,
    // Only meaningful for the owner's own gallery (others never see live clips).
    live: {
      waitingForOpponent: clip.tickets.length > 0,
      battleId: activeBattle?.id ?? null,
    },
    // Last finished battle (profile clip grid "Result Badge"): WON / LOST / TIE, or null.
    battle: result,
    ...extra,
  };
}

type LatestBattle = ClipWithRelations['battlesAsA'][number];

function latestBattle(clip: ClipWithRelations): { battle: LatestBattle; side: 'A' | 'B' } | null {
  const a = clip.battlesAsA[0];
  const b = clip.battlesAsB[0];
  if (a && (!b || a.createdAt >= b.createdAt)) return { battle: a, side: 'A' };
  return b ? { battle: b, side: 'B' } : null;
}

/** The clip's battle while voting is live (clips are in at most one live battle). */
export function activeBattleOf(clip: ClipWithRelations) {
  const latest = latestBattle(clip);
  return latest?.battle.status === 'ACTIVE' ? latest.battle : null;
}

function battleResultOf(clip: ClipWithRelations) {
  const latest = latestBattle(clip);
  if (!latest || latest.battle.status !== 'CLOSED') return null;
  const { winnerSide } = latest.battle;
  return { id: latest.battle.id, result: winnerSide === null ? 'TIE' : winnerSide === latest.side ? 'WON' : 'LOST' };
}
