import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { loyalty } from "../integrations/loyalty.js";
import { LoyaltyError, type CartItem } from "../integrations/loyaltyClient.js";

/**
 * Till-facing proxy for the loyalty service. The React client calls THESE routes (with a
 * normal cashier JWT); this server holds the SERVICE_API_KEY and forwards. The key never
 * reaches the browser. Redemption is online-only, so if the loyalty service is unreachable
 * these fail cleanly and the client completes the sale at full price.
 */

const cartItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(), // paise
  category: z.string().optional(),
});

const applySchema = z.union([
  z.object({ issuedRewardId: z.string().min(1) }),
  z.object({ pointsToRedeem: z.number().int().positive() }),
]);

/** Map a loyalty error code to an HTTP status the till can branch on. */
function statusFor(code: LoyaltyError["code"]): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "VALIDATION_FAILED":
      return 400;
    case "REWARD_UNAVAILABLE":
    case "INSUFFICIENT_POINTS":
    case "REDEMPTION_NOT_ALLOWED":
    case "CONFLICT":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "UNAUTHORIZED":
      return 502; // our key is wrong — a server misconfig, not the cashier's fault
    default:
      return 503; // TIMEOUT / NETWORK / UNAVAILABLE / INTERNAL
  }
}

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof LoyaltyError) {
    return reply.code(statusFor(e.code)).send({ error: e.message, code: e.code });
  }
  throw e;
}

export async function loyaltyRoutes(app: FastifyInstance) {
  // The client reads this to decide whether to show the loyalty panel at all.
  app.get("/loyalty/enabled", async () => ({ enabled: !!loyalty }));

  // Balance snapshot for the till (identity, points, tier). null = unknown/unreachable.
  app.get("/loyalty/customer/:phone", { preHandler: requireAuth }, async (req, reply) => {
    if (!loyalty) return reply.code(503).send({ error: "Loyalty not configured" });
    const { phone } = req.params as { phone: string };
    try {
      return { customer: await loyalty.getCustomer(phone) };
    } catch (e) {
      return fail(reply, e);
    }
  });

  // What can this customer use against the current cart? Read-only, spends nothing.
  app.post("/loyalty/quote", { preHandler: requireAuth }, async (req, reply) => {
    if (!loyalty) return reply.code(503).send({ error: "Loyalty not configured" });
    const parsed = z
      .object({
        phone: z.string().min(1),
        amount: z.number().int().nonnegative(),
        items: z.array(cartItemSchema).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote request" });
    try {
      return await loyalty.quote(parsed.data as { phone: string; amount: number; items?: CartItem[] });
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Spend a reward or points. CONFIRM mode — the discount is applied to this sale now.
  app.post("/loyalty/redeem", { preHandler: requireAuth }, async (req, reply) => {
    if (!loyalty) return reply.code(503).send({ error: "Loyalty not configured" });
    const parsed = z
      .object({
        ref: z.string().min(1),
        phone: z.string().min(1),
        amount: z.number().int().nonnegative(),
        items: z.array(cartItemSchema).optional(),
        apply: applySchema,
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid redeem request" });
    try {
      const r = await loyalty.redeem({
        orderId: parsed.data.ref,
        phone: parsed.data.phone,
        amount: parsed.data.amount,
        items: parsed.data.items as CartItem[] | undefined,
        apply: parsed.data.apply,
        mode: "CONFIRM",
      });
      return r;
    } catch (e) {
      return fail(reply, e);
    }
  });

  // Give a redemption back (cashier removed the reward, or abandoned the sale). Idempotent.
  app.post("/loyalty/void", { preHandler: requireAuth }, async (req, reply) => {
    if (!loyalty) return reply.code(503).send({ error: "Loyalty not configured" });
    const parsed = z.object({ ref: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "ref required" });
    try {
      return await loyalty.voidRedemption(parsed.data.ref, "Removed at the till");
    } catch (e) {
      return fail(reply, e);
    }
  });
}
