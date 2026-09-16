/**
 * Fruitified Loyalty client — the drop-in from the loyalty service's POS-INTEGRATION.md,
 * running on the CafePOS *server* (the SERVICE_API_KEY must never reach the browser).
 *
 * Two rules encoded here:
 *   - Earning is eventual: `recordPurchase` is safe to retry forever (idempotent on orderId).
 *   - Redemption is online: `redeem` throws rather than guessing, and the caller must
 *     not apply a discount unless it resolves.
 *
 * All money is integer paise. Nothing here can block a sale: every call has a hard
 * timeout and the read paths return null instead of throwing.
 */

export interface LoyaltyConfig {
  baseUrl: string; // e.g. https://loyalty.example.up.railway.app
  apiKey: string; // SERVICE_API_KEY
  source?: string; // which till, e.g. "cafepos-till-1"
  timeoutMs?: number; // default 2500 — a till must never hang on loyalty
}

export interface CartItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number; // paise, per unit
  category?: string; // send it: category-scoped programs depend on this
}

export interface StampProgress {
  programId: string;
  name: string;
  progress: number;
  goal: number;
  completed: boolean;
  kind?: string;
  expiresAt?: string | null;
}

export interface IssuedReward {
  id: string;
  name: string;
  type: "FREE_ITEM" | "DISCOUNT_AMOUNT" | "DISCOUNT_PERCENT" | "STORE_CREDIT" | "POINTS_GRANT";
  value: Record<string, unknown>;
  expiresAt: string | null;
  programId?: string | null;
}

export interface PurchaseResult {
  idempotent: boolean;
  customer: {
    phone: string;
    name: string | null;
    pointsBalance: number;
    tier: { id: string; name: string } | null;
  };
  awarded: {
    points: number;
    stamps: StampProgress[];
    rewardsIssued: IssuedReward[];
    tierChanged?: { from: string | null; to: string | null } | null;
  };
  notes: string[];
}

export interface CustomerSnapshot {
  phone: string;
  name: string | null;
  pointsBalance: number;
  pointsValue: number; // paise
  tier: { id: string; name: string } | null;
  stamps: StampProgress[];
  rewards: IssuedReward[];
  memberships: unknown[];
  lifetimeSpend: number;
  visitCount: number;
  consentMarketing: boolean;
}

export interface RedemptionResult {
  redemptionId: string;
  orderId: string;
  status: "RESERVED" | "CONFIRMED" | "VOID";
  discountAmount: number; // paise — apply exactly this
  freeItems: { productId: string; qty: number }[];
  pointsRedeemed: number;
  pointsBalance: number;
  idempotent: boolean;
  description: string;
}

export interface QuoteOption {
  apply: { issuedRewardId: string } | { pointsToRedeem: number };
  label: string;
  discountAmount: number; // paise
  freeItems: { productId: string; qty: number }[];
  unavailableReason: string | null;
}

export interface QuoteResult {
  phone: string;
  options: QuoteOption[];
  pointsBalance: number;
  maxPointsRedeemable: number;
}

export type LoyaltyErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "REWARD_UNAVAILABLE"
  | "INSUFFICIENT_POINTS"
  | "REDEMPTION_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "NETWORK";

export class LoyaltyError extends Error {
  constructor(
    readonly code: LoyaltyErrorCode,
    message: string,
    readonly status = 0
  ) {
    super(message);
    this.name = "LoyaltyError";
  }

  /** True when the service is unreachable rather than saying "no" — safe to queue. */
  get isUnavailable(): boolean {
    return (
      this.code === "TIMEOUT" ||
      this.code === "NETWORK" ||
      this.code === "UNAVAILABLE" ||
      this.code === "INTERNAL"
    );
  }

  /** Permanent request-level failures — retrying the same payload will never help. */
  get isPermanent(): boolean {
    return this.code === "VALIDATION_FAILED" || this.code === "UNAUTHORIZED";
  }
}

export function createLoyaltyClient(config: LoyaltyConfig) {
  const timeoutMs = config.timeoutMs ?? 2500;
  const source = config.source ?? "cafepos";
  const base = config.baseUrl.replace(/\/$/, "");

  async function call<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${base}${path}`, {
        method: init.method,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: controller.signal,
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const code = (payload?.error?.code ?? "INTERNAL") as LoyaltyErrorCode;
        throw new LoyaltyError(
          code,
          payload?.error?.message ?? `HTTP ${response.status}`,
          response.status
        );
      }
      return payload as T;
    } catch (error) {
      if (error instanceof LoyaltyError) throw error;
      if ((error as Error)?.name === "AbortError") {
        throw new LoyaltyError("TIMEOUT", "Loyalty service did not respond in time.");
      }
      throw new LoyaltyError("NETWORK", "Could not reach the loyalty service.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /**
     * Call when an order is marked PAID. Idempotent on orderId — retry forever.
     * `occurredAt` must be when the sale happened, not when you are sending it.
     */
    async recordPurchase(input: {
      orderId: string;
      phone: string;
      name?: string;
      amount: number; // paise, after POS-side discounts
      items: CartItem[];
      occurredAt: Date | string;
      referralCode?: string;
    }): Promise<PurchaseResult> {
      return call<PurchaseResult>("/api/integration/events/purchase", {
        method: "POST",
        body: {
          orderId: input.orderId,
          phone: input.phone,
          ...(input.name ? { name: input.name } : {}),
          amount: input.amount,
          currency: "INR",
          items: input.items,
          occurredAt:
            input.occurredAt instanceof Date ? input.occurredAt.toISOString() : input.occurredAt,
          source,
          ...(input.referralCode ? { referralCode: input.referralCode } : {}),
        },
      });
    },

    /**
     * Balance snapshot for the checkout screen.
     * Returns null for an unknown customer AND when loyalty is unreachable — neither
     * is a reason to interrupt a sale.
     */
    async getCustomer(phone: string): Promise<CustomerSnapshot | null> {
      try {
        return await call<CustomerSnapshot>(
          `/api/integration/customers/${encodeURIComponent(phone)}`,
          { method: "GET" }
        );
      } catch (error) {
        if (error instanceof LoyaltyError && (error.code === "NOT_FOUND" || error.isUnavailable)) {
          return null;
        }
        throw error;
      }
    },

    /**
     * Spend a reward or points. ONLINE ONLY.
     * Throws on any failure — do not apply a discount unless this resolves.
     * Retrying the identical call is safe: you get the same redemption back.
     */
    async redeem(input: {
      orderId: string;
      phone: string;
      amount: number; // cart total in paise
      items?: CartItem[];
      apply: { issuedRewardId: string } | { pointsToRedeem: number };
      mode?: "RESERVE" | "CONFIRM";
    }): Promise<RedemptionResult> {
      return call<RedemptionResult>("/api/integration/redemptions", {
        method: "POST",
        body: {
          orderId: input.orderId,
          phone: input.phone,
          amount: input.amount,
          items: input.items ?? [],
          apply: input.apply,
          mode: input.mode ?? "CONFIRM",
          occurredAt: new Date().toISOString(),
          source,
        },
      });
    },

    /** Read-only: what could this customer use against this cart? Nothing is spent. */
    async quote(input: {
      phone: string;
      amount: number; // pre-reward cart amount, paise
      items?: CartItem[];
    }): Promise<QuoteResult> {
      return call<QuoteResult>("/api/integration/redemptions/quote", {
        method: "POST",
        body: { phone: input.phone, amount: input.amount, items: input.items ?? [] },
      });
    },

    /** Call on every cancellation or refund. Idempotent. */
    async voidRedemption(orderId: string, reason = "Order cancelled at the till") {
      return call<{
        orderId: string;
        voided: {
          redemptionId: string;
          pointsRestored: number;
          rewardRestored: boolean;
          alreadyVoid: boolean;
        }[];
        pointsBalance: number | null;
      }>(`/api/integration/redemptions/${encodeURIComponent(orderId)}/void`, {
        method: "POST",
        body: { reason },
      });
    },

    /** Settle a redemption taken with mode: 'RESERVE'. */
    async confirmRedemption(orderId: string) {
      return call<{ orderId: string; redemptions: RedemptionResult[] }>(
        `/api/integration/redemptions/${encodeURIComponent(orderId)}/confirm`,
        { method: "POST", body: {} }
      );
    },

    /** Non-purchase trigger. Pass an idempotencyKey to make it safe to retry. */
    async recordAction(input: {
      phone: string;
      actionType: string;
      idempotencyKey?: string;
      meta?: Record<string, unknown>;
    }): Promise<PurchaseResult> {
      return call<PurchaseResult>("/api/integration/events/action", {
        method: "POST",
        body: {
          phone: input.phone,
          actionType: input.actionType,
          ...(input.idempotencyKey ? { orderId: input.idempotencyKey } : {}),
          ...(input.meta ? { meta: input.meta } : {}),
          occurredAt: new Date().toISOString(),
          source,
        },
      });
    },

    /** Cheap reachability probe. Read `database` before offering redemption. */
    async health(): Promise<{ ok: boolean; database: "up" | "down" } | null> {
      try {
        const response = await fetch(`${base}/api/health`, {
          signal: AbortSignal.timeout(1500),
        });
        return response.ok
          ? ((await response.json()) as { ok: boolean; database: "up" | "down" })
          : null;
      } catch {
        return null;
      }
    },
  };
}

export type LoyaltyClient = ReturnType<typeof createLoyaltyClient>;
