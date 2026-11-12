import type { Game, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { errors } from '../../utils/app-error';
import { parseCriteria } from './games.schemas';
import type { createGameSchema, updateGameSchema } from './games.schemas';
import type { z } from 'zod';

function toGameDto(game: Game) {
  return {
    id: game.id,
    slug: game.slug,
    name: game.name,
    iconUrl: game.iconUrl,
    criteria: parseCriteria(game.criteria),
    isActive: game.isActive,
    sortOrder: game.sortOrder,
  };
}

const order: Prisma.GameOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { name: 'asc' }];

export async function listActiveGames() {
  const games = await prisma.game.findMany({ where: { isActive: true }, orderBy: order });
  return games.map(toGameDto);
}

export async function listAllGames() {
  const games = await prisma.game.findMany({
    orderBy: order,
    include: { _count: { select: { clips: true, battles: true } } },
  });
  return games.map((game) => ({ ...toGameDto(game), counts: game._count }));
}

export async function getActiveGame(id: string) {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game || !game.isActive) throw errors.badRequest('This game is not available');
  return toGameDto(game);
}

export async function createGame(input: z.infer<typeof createGameSchema>) {
  return toGameDto(await prisma.game.create({ data: input }));
}

export async function updateGame(id: string, input: z.infer<typeof updateGameSchema>) {
  return toGameDto(await prisma.game.update({ where: { id }, data: input }));
}
