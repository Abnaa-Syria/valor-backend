import type { CreditBalance, CreditSource, CreditType, LedgerReason, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/app-error';
import { paginated, toSkipTake, type Pagination } from '../../utils/pagination';
import { getSettings } from '../settings/settings.service';
import type { SettingsValues } from '../settings/settings.registry';

/**
 * Credits rules
 * - Two wallets per player: VOTING and CHALLENGE. Each has a free part and a purchased part.
 * - Free credits reset to the daily allowance once per local day (setting: dailyResetTimezone).
 *   Unused free credits expire at the reset. Purchased credits never expire.
 * - Every change writes ledger rows; the balance row is a cache updated in the same transaction.
 * - All functions taking `tx` must run inside prisma.$transaction, which holds a row lock
 *   on the balance until commit, so two requests can't spend the same credit.
 */

type Tx = Prisma.TransactionClient;
type Ref = { refType: string; refId: string };

export function insufficientCredits(type: CreditType, available: number) {
  const name = type === 'VOTING' ? 'Voting' : 'Challenge';
  return new AppError(402, 'INSUFFICIENT_CREDITS', `Not enough ${name} Credits`, { type, available });
}

function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function dailyAllowance(type: CreditType, settings: SettingsValues) {
  return type === 'VOTING' ? settings.dailyFreeVotingCredits : settings.dailyFreeChallengeCredits;
}

/** Locks the balance row (creating it if needed) and applies today's free allowance. */
async function lockBalance(tx: Tx, userId: string, type: CreditType, settings: SettingsValues): Promise<CreditBalance> {
  await tx.creditBalance.upsert({ where: { userId_type: { userId, type } }, create: { userId, type }, update: {} });
  await tx.$queryRaw`SELECT id FROM credit_balances WHERE userId = ${userId} AND type = ${type} FOR UPDATE`;
  const balance = await tx.creditBalance.findUniqueOrThrow({ where: { userId_type: { userId, type } } });

  const now = new Date();
  const tz = settings.dailyResetTimezone;
  if (balance.freeResetAt && localDay(balance.freeResetAt, tz) === localDay(now, tz)) return balance;

  const daily = dailyAllowance(type, settings);
  const entries: Prisma.CreditLedgerEntryCreateManyInput[] = [];
  if (balance.freeBalance > 0) {
    entries.push({ userId, type, source: 'FREE', amount: -balance.freeBalance, reason: 'FREE_EXPIRED' });
  }
  if (daily > 0) {
    entries.push({ userId, type, source: 'FREE', amount: daily, reason: 'DAILY_ALLOWANCE' });
  }
  if (entries.length > 0) await tx.creditLedgerEntry.createMany({ data: entries });

  return tx.creditBalance.update({ where: { id: balance.id }, data: { freeBalance: daily, freeResetAt: now } });
}

function toWalletDto(balance: CreditBalance, settings: SettingsValues) {
  return {
    type: balance.type,
    free: balance.freeBalance,
    purchased: balance.purchasedBalance,
    total: balance.freeBalance + balance.purchasedBalance,
    dailyAllowance: dailyAllowance(balance.type, settings),
  };
}

export async function getWallet(userId: string) {
  const settings = await getSettings();
  return prisma.$transaction(async (tx) => {
    const voting = await lockBalance(tx, userId, 'VOTING', settings);
    const challenge = await lockBalance(tx, userId, 'CHALLENGE', settings);
    return { voting: toWalletDto(voting, settings), challenge: toWalletDto(challenge, settings) };
  });
}

/** Spends credits for an action. Throws INSUFFICIENT_CREDITS (402) without changing anything. */
export async function spend(
  tx: Tx,
  input: { userId: string; type: CreditType; amount?: number; reason: LedgerReason } & Ref,
) {
  const amount = input.amount ?? 1;
  const settings = await getSettings();
  const balance = await lockBalance(tx, input.userId, input.type, settings);
  const available = balance.freeBalance + balance.purchasedBalance;
  if (available < amount) throw insufficientCredits(input.type, available);

  const freeFirst = settings.creditDeductionOrder === 'FREE_FIRST';
  const firstPool = freeFirst ? balance.freeBalance : balance.purchasedBalance;
  const fromFirst = Math.min(firstPool, amount);
  const fromSecond = amount - fromFirst;
  const fromFree = freeFirst ? fromFirst : fromSecond;
  const fromPurchased = freeFirst ? fromSecond : fromFirst;

  const entries: Prisma.CreditLedgerEntryCreateManyInput[] = [];
  const base = { userId: input.userId, type: input.type, reason: input.reason, refType: input.refType, refId: input.refId };
  if (fromFree > 0) entries.push({ ...base, source: 'FREE', amount: -fromFree });
  if (fromPurchased > 0) entries.push({ ...base, source: 'PURCHASED', amount: -fromPurchased });
  await tx.creditLedgerEntry.createMany({ data: entries });

  await tx.creditBalance.update({
    where: { id: balance.id },
    data: { freeBalance: { decrement: fromFree }, purchasedBalance: { decrement: fromPurchased } },
  });
}

/**
 * Gives back what was spent for a reference (e.g. a battle entry that never matched),
 * to the same pools it came from. Safe to call twice: the second call does nothing.
 */
export async function refund(
  tx: Tx,
  input: { userId: string; type: CreditType; reason: LedgerReason; note?: string } & Ref,
) {
  const entries = await tx.creditLedgerEntry.findMany({
    where: { userId: input.userId, type: input.type, refType: input.refType, refId: input.refId },
  });
  const net = { FREE: 0, PURCHASED: 0 } as Record<CreditSource, number>;
  for (const entry of entries) net[entry.source] += entry.amount;

  const backFree = Math.max(0, -net.FREE);
  const backPurchased = Math.max(0, -net.PURCHASED);
  if (backFree === 0 && backPurchased === 0) return; // nothing spent, or already refunded

  const settings = await getSettings();
  const balance = await lockBalance(tx, input.userId, input.type, settings);

  const base = { userId: input.userId, type: input.type, reason: input.reason, refType: input.refType, refId: input.refId, note: input.note };
  const rows: Prisma.CreditLedgerEntryCreateManyInput[] = [];
  if (backFree > 0) rows.push({ ...base, source: 'FREE', amount: backFree });
  if (backPurchased > 0) rows.push({ ...base, source: 'PURCHASED', amount: backPurchased });
  await tx.creditLedgerEntry.createMany({ data: rows });

  await tx.creditBalance.update({
    where: { id: balance.id },
    data: { freeBalance: { increment: backFree }, purchasedBalance: { increment: backPurchased } },
  });
}

/** Adds (or removes, with a negative amount) purchased credits: store purchases and admin adjustments. */
export async function adjustPurchased(
  tx: Tx,
  input: { userId: string; type: CreditType; amount: number; reason: LedgerReason; note?: string } & Partial<Ref>,
) {
  const settings = await getSettings();
  const balance = await lockBalance(tx, input.userId, input.type, settings);
  if (balance.purchasedBalance + input.amount < 0) throw insufficientCredits(input.type, balance.purchasedBalance);

  await tx.creditLedgerEntry.create({
    data: {
      userId: input.userId,
      type: input.type,
      source: 'PURCHASED',
      amount: input.amount,
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
    },
  });
  const updated = await tx.creditBalance.update({
    where: { id: balance.id },
    data: { purchasedBalance: { increment: input.amount } },
  });
  return toWalletDto(updated, settings);
}

export async function listLedger(userId: string, query: Pagination & { type?: CreditType }) {
  const where: Prisma.CreditLedgerEntryWhereInput = { userId, type: query.type };
  const [items, total] = await prisma.$transaction([
    prisma.creditLedgerEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, type: true, source: true, amount: true, reason: true, refType: true, refId: true, note: true, createdAt: true },
      ...toSkipTake(query),
    }),
    prisma.creditLedgerEntry.count({ where }),
  ]);
  return paginated(items, total, query);
}
