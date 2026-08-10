import type { FastifyInstance } from "fastify";
import { checkoutSchema, settleSchema } from "@cafepos/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";
import { createOrder, settleOrder, OrderError } from "../services/order.js";

export async function orderRoutes(app: FastifyInstance) {
  // One-shot create-and-pay. A fruit-cafe till rings and settles in a single call:
  // ready-made items complete instantly; prepared items open Kitchen Display tickets.
  app.post("/checkout", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid order", details: parsed.error.flatten() });
    }
    const input = parsed.data;
    try {
      const { order, change } = await createOrder({
        source: input.source,
        items: input.items,
        discount: input.discount,
        cashierId: req.user!.id,
        customerPhone: input.customerPhone,
        customerName: input.customerName,
        payment: input.payment,
      });
      return reply.code(201).send({ order, change });
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  // Orders awaiting payment (kiosk cash/card at the counter) — for the POS settle list.
  app.get("/orders/pending", { preHandler: requireAuth }, async () => {
    const orders = await prisma.order.findMany({
      where: { status: "AWAITING_PAYMENT" },
      orderBy: { createdAt: "asc" },
      include: { items: true, customer: true },
    });
    return { orders };
  });

  // Cashier confirms cash/card received at the counter → order goes to the kitchen.
  app.post("/orders/:id/settle", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = settleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid tender" });
    try {
      const order = await settleOrder(id, parsed.data.method);
      return { order };
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  // Recent orders (for a simple bills/history view).
  app.get("/orders", { preHandler: requireAuth }, async (req) => {
    const { limit } = req.query as { limit?: string };
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit ?? 50), 200),
      include: { items: true, payment: true, customer: true },
    });
    return { orders };
  });

  app.get("/orders/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, payment: true, customer: true, cashier: true },
    });
    if (!order) return reply.code(404).send({ error: "Not found" });
    return { order };
  });
}
