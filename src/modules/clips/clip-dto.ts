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

export const clipInclude = {
  game: { select: { id: true, slug: true, name: true } },
  user: { select: playerSummarySelect },
  tickets: { where: { status: 'QUEUED' }, select: { id: true }, take: 1 },
  battlesAsA: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
  battlesAsB: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 },
} satisfies Prisma.ClipInclude;

export type ClipWithRelations = Prisma.ClipGetPayload<{ include: typeof clipInclude }>;

export function toClipDto(clip: ClipWithRelations, extra: { likedByMe?: boolean } = {}) {
  const activeBattle = clip.battlesAsA[0] ?? clip.battlesAsB[0];
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
    ...extra,
  };
}
