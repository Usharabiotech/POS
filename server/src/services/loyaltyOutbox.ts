import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { loyalty } from "../integrations/loyalty.js";
import { LoyaltyError, type CartItem } from "../integrations/loyaltyClient.js";

/** The exact recordPurchase() input we persist and later replay. JSON-safe. */
export interface LoyaltyPurchasePayload {
  orderId: string;
  phone: string;
  name?: string;
  amount: number; // paise
  items: CartItem[];
  occurredAt: string; // ISO string
}

const MAX_ATTEMPTS = 15;

/**
 * Enqueue a purchase event INSIDE the caller's transaction, so the earn is durable the
 * instant the order is committed — a crash or loyalty outage cannot lose it. Idempotent
 * on orderId (a replayed settle won't create a second row). No network here.
 */
export async function enqueuePurchaseEvent(
  tx: Prisma.TransactionClient,
  payload: LoyaltyPurchasePayload
): Promise<void> {
  await tx.loyaltyOutbox.upsert({
    where: { orderId: payload.orderId },
    create: { orderId: payload.orderId, payload: payload as unknown as Prisma.InputJsonValue },
    update: {}, // already queued — leave the original untouched
  });
}

let flushing = false;

/**
 * Send every PENDING outbox row to the loyalty service. Safe to call repeatedly and
 * concurrently (guarded). recordPurchase is idempotent, so a double-send never
 * double-awards. Rows stay PENDING on transient failure (retried next tick) and flip to
 * FAILED only on a permanent error (bad payload / bad key) or after MAX_ATTEMPTS.
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number; pending: number }> {
  if (!loyalty || flushing) return { sent: 0, failed: 0, pending: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    const rows = await prisma.loyaltyOutbox.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    for (const row of rows) {
      try {
        await loyalty.recordPurchase(row.payload as unknown as LoyaltyPurchasePayload);
        await prisma.loyaltyOutbox.update({
          where: { id: row.id },
          data: { status: "SENT", sentAt: new Date(), lastError: null },
        });
        sent++;
      } catch (err) {
        const le = err instanceof LoyaltyError ? err : null;
        const attempts = row.attempts + 1;
        // Permanent (bad request / bad key) or exhausted → park as FAILED for a human.
        const giveUp = (le?.isPermanent ?? false) || attempts >= MAX_ATTEMPTS;
        await prisma.loyaltyOutbox.update({
          where: { id: row.id },
          data: {
            attempts,
            lastError: (le?.code ? `${le.code}: ` : "") + (err as Error).message,
            ...(giveUp ? { status: "FAILED" } : {}),
          },
        });
        if (giveUp) failed++;
        // Transient (service down) → stop this pass; retry the whole queue next tick.
        if (le?.isUnavailable) break;
      }
    }
    const pending = await prisma.loyaltyOutbox.count({ where: { status: "PENDING" } });
    return { sent, failed, pending };
  } finally {
    flushing = false;
  }
}

/** Fire-and-forget flush for low latency right after an order commits. Never throws. */
export function kickFlush(): void {
  if (!loyalty) return;
  flushOutbox().catch(() => {
    /* logged by the interval flusher on the next tick */
  });
}

let timer: NodeJS.Timeout | null = null;

/** Start the periodic flusher (no-op when loyalty is disabled). Returns a stop function. */
export function startOutboxFlusher(
  log: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void },
  intervalMs = 30_000
): () => void {
  if (!loyalty) return () => {};
  const tick = () => {
    flushOutbox()
      .then((r) => {
        if (r.sent || r.failed) log.info({ ...r }, "loyalty outbox flushed");
      })
      .catch((err) => log.error({ err }, "loyalty outbox flush failed"));
  };
  tick(); // drain anything queued while we were down
  timer = setInterval(tick, intervalMs);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}
