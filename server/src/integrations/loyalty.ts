import { env, loyaltyEnabled } from "../env.js";
import { createLoyaltyClient, type LoyaltyClient } from "./loyaltyClient.js";

/**
 * Single shared loyalty client, or null when the integration is switched off
 * (no LOYALTY_URL / LOYALTY_API_KEY). Callers must handle null so the POS keeps
 * working standalone.
 */
export const loyalty: LoyaltyClient | null = loyaltyEnabled
  ? createLoyaltyClient({
      baseUrl: env.loyaltyUrl,
      apiKey: env.loyaltyApiKey,
      source: `cafepos-till-${env.tillId}`,
    })
  : null;
