import type { FastifyInstance } from "fastify";
import { kdsUpdateSchema } from "@cafepos/shared";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export async function kdsRoutes(app: FastifyInstance) {
  // Active kitchen tickets: any line not yet COMPLETED, grouped by order.
  // POS ready-made items are created COMPLETED so they don't show; prepared POS
  // items plus the WHOLE of kiosk/Swiggy/Zomato orders are PENDING and do show.
  // Cheap realtime: the client polls this every 3s (no WebSocket server to run).
  app.get("/kds/tickets", { preHandler: requireAuth }, async () => {
    const items = await prisma.orderItem.findMany({
      // Only PAID orders reach the kitchen — payment is the gate.
      where: { kdsStatus: { not: "COMPLETED" }, order: { is: { paid: true } } },
      orderBy: { order: { createdAt: "asc" } },
      include: { order: { select: { number: true, createdAt: true, source: true } } },
    });

    const ticketMap = new Map<
      string,
      {
        orderId: string;
        number: number;
        source: string;
        createdAt: Date;
        items: typeof items;
      }
    >();
    for (const it of items) {
      let t = ticketMap.get(it.orderId);
      if (!t) {
        t = {
          orderId: it.orderId,
          number: it.order.number,
          source: it.order.source,
          createdAt: it.order.createdAt,
          items: [],
        };
        ticketMap.set(it.orderId, t);
      }
      t.items.push(it);
    }
    return { tickets: [...ticketMap.values()] };
  });

  // Advance a single line's kitchen status (Pending → Preparing → Ready → Completed).
  app.patch("/kds/items/:id", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = kdsUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid status" });

    const item = await prisma.orderItem.update({
      where: { id },
      data: { kdsStatus: parsed.data.status },
    });

    // When every prepared line of an order is completed, close the order.
    if (parsed.data.status === "COMPLETED") {
      const remaining = await prisma.orderItem.count({
        where: { orderId: item.orderId, kind: "PREPARED", kdsStatus: { not: "COMPLETED" } },
      });
      if (remaining === 0) {
        await prisma.order.update({
          where: { id: item.orderId },
          data: { status: "COMPLETED" },
        });
      }
    }
    return { item };
  });
}
