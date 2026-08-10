import type { FastifyInstance } from "fastify";
import { kioskOrderSchema } from "@cafepos/shared";
import { requireAuth } from "../auth.js";
import { createOrder, OrderError } from "../services/order.js";

export async function kioskRoutes(app: FastifyInstance) {
  // Kiosk places an order and picks a tender. The order is held as AWAITING_PAYMENT
  // (not sent to the kitchen, no stock deducted) until payment is confirmed:
  //   CASH / CARD → customer pays at the counter, cashier settles on the POS
  //   UPI         → customer pays on-screen (QR / WhatsApp link), gateway confirms
  app.post("/kiosk/order", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = kioskOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid order" });
    }
    const { items, customerName, customerPhone, tender } = parsed.data;
    try {
      const { order } = await createOrder({
        source: "KIOSK",
        items,
        customerName,
        customerPhone,
        awaitPayment: true,
        tender,
      });
      return reply.code(201).send({ order });
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });
}
