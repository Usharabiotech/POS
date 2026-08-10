import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { channelOrderSchema } from "@cafepos/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { createOrder, OrderError } from "../services/order.js";

/**
 * Delivery-aggregator (Swiggy / Zomato) integration.
 *
 * REAL INTEGRATION: Swiggy/Zomato push new orders to POST /api/channels/webhook once
 * you are an approved POS partner. Protect it with CHANNEL_WEBHOOK_SECRET (a shared
 * header secret) — platforms can't send our JWT. Their menu items are mapped to our
 * productIds during onboarding. Orders land on the Kitchen Display and alert the till.
 *
 * UNTIL THEN: POST /api/channels/simulate (logged in) fabricates a realistic order so
 * the whole flow — sound alert + KDS ticket — can be demoed today.
 */
export async function channelRoutes(app: FastifyInstance) {
  async function ingest(input: {
    platform: "SWIGGY" | "ZOMATO";
    externalRef: string;
    customerName?: string;
    items: { productId: string; qty: number }[];
  }) {
    // Idempotency: the same platform order id must not create two tickets.
    const existing = await prisma.order.findFirst({ where: { externalRef: input.externalRef } });
    if (existing) return { order: existing, duplicate: true as const };

    const { order } = await createOrder({
      source: input.platform,
      items: input.items,
      customerName: input.customerName,
      externalRef: input.externalRef,
      prepaidOnline: true,
    });
    return { order, duplicate: false as const };
  }

  // ── Real webhook (secret-protected, no JWT) ────────────────────────────────
  app.post("/channels/webhook", async (req, reply) => {
    const secret = req.headers["x-channel-secret"];
    if (!env.channelWebhookSecret || secret !== env.channelWebhookSecret) {
      return reply.code(401).send({ error: "Bad channel secret" });
    }
    const parsed = channelOrderSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid channel order" });
    try {
      const { order, duplicate } = await ingest(parsed.data);
      return reply.code(duplicate ? 200 : 201).send({ order, duplicate });
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  // ── Simulator (logged in) — fabricate an order to demo the pipeline ─────────
  app.post("/channels/simulate", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z
      .object({ platform: z.enum(["SWIGGY", "ZOMATO"]).default("SWIGGY") })
      .safeParse(req.body ?? {});
    const platform = parsed.success ? parsed.data.platform : "SWIGGY";

    // Pick 1-3 random active products (prefer prepared items so they hit the kitchen).
    const pool = await prisma.product.findMany({ where: { active: true } });
    if (pool.length === 0) return reply.code(400).send({ error: "No products to order" });
    const pickCount = 1 + Math.floor((Date.now() % 3));
    const items: { productId: string; qty: number }[] = [];
    for (let i = 0; i < pickCount; i++) {
      const p = pool[(Date.now() + i * 7) % pool.length]!;
      items.push({ productId: p.id, qty: 1 + ((Date.now() + i) % 2) });
    }
    const externalRef = `${platform}-SIM-${Date.now()}`;
    try {
      const { order } = await ingest({ platform, externalRef, customerName: "Online Customer", items });
      return reply.code(201).send({ order });
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  // ── Feed the till polls to raise the sound alert ───────────────────────────
  app.get("/channels/orders", { preHandler: requireAuth }, async (req) => {
    const { since } = req.query as { since?: string };
    const after = since ? new Date(since) : new Date(Date.now() - 60_000);
    const orders = await prisma.order.findMany({
      where: { source: { in: ["SWIGGY", "ZOMATO"] }, createdAt: { gt: after } },
      orderBy: { createdAt: "asc" },
      include: { items: true },
      take: 20,
    });
    return { orders, now: new Date().toISOString() };
  });
}
