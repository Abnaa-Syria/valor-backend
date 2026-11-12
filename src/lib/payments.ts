import type { StoreProvider } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';

/**
 * Store receipt verification.
 *
 * The app buys through Apple / Google, then sends us the transaction. We confirm it with the
 * store before giving anything. Only after verification is the purchase recorded and fulfilled.
 *
 * - TEST: accepted when PAYMENTS_TEST_MODE is on (development / QA). No money moves.
 * - APP_STORE / PLAY_STORE: to be connected once the App Store Connect API key and the
 *   Google Play service account are available. Nothing else in the code changes.
 */
export type VerifiedPurchase = {
  /** Unique across providers, e.g. "APP_STORE:2000000123". */
  storeTransactionId: string;
  productId: string;
};

export async function verifyStorePurchase(input: {
  provider: StoreProvider;
  productId: string;
  transactionId: string;
  receipt?: string;
}): Promise<VerifiedPurchase> {
  switch (input.provider) {
    case 'TEST':
      if (!env.paymentsTestMode) {
        throw new AppError(400, 'TEST_PAYMENTS_DISABLED', 'Test purchases are not accepted on this server');
      }
      return { storeTransactionId: `TEST:${input.transactionId}`, productId: input.productId };

    case 'APP_STORE':
    case 'PLAY_STORE':
      throw new AppError(501, 'PAYMENT_PROVIDER_NOT_CONFIGURED', `${input.provider} verification is not set up yet`);
  }
}
