/**
 * How a player appears anywhere in the app (battles, clips, comments, leaderboard, rematch):
 * name, avatar and the active frame the app draws around the avatar.
 */
export const playerSummarySelect = {
  id: true,
  username: true,
  avatarUrl: true,
  activeFrame: { select: { slug: true, assetUrl: true, metadata: true } },
} as const;
