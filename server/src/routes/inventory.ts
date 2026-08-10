import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

/**
 * Inventory management report — integrated with the POS. Because stock is deducted
 * from the same Product rows the POS sells, "units sold" and "stock on hand" always
 * reconcile. Gives current levels, valuation (cost + retail), low-stock, and the
 * units/value sold over a window so stock can be checked against sales.
 */
export async function inventoryRoutes(app: FastifyInstance) {
  app.get(
    "/inventory/report",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (req) => {
      const { days } = req.query as { days?: string };
      const windowDays = Math.max(1, Math.min(Number(days ?? 1), 90));
      const since = new Date();
      since.setDate(since.getDate() - (windowDays - 1));
      since.setHours(0, 0, 0, 0);

      // Units + revenue sold per product over the window (paid, non-cancelled).
      const sold = await prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          order: { is: { paid: true, status: { not: "CANCELLED" }, createdAt: { gte: since } } },
        },
        _sum: { qty: true, lineTotal: true },
      });
      const soldBy = new Map(sold.map((s) => [s.productId, s._sum]));

      const products = await prisma.product.findMany({
        where: { active: true },
        include: { category: { select: { name: true } } },
        orderBy: [{ stock: "asc" }, { name: "asc" }],
      });

      const items = products.map((p) => {
        const s = soldBy.get(p.id);
        const soldQty = s?.qty ?? 0;
        const soldValue = s?.lineTotal ?? 0;
        const tracked = p.stock !== null;
        const stock = p.stock ?? null;
        const low = tracked && (p.stock as number) <= p.lowStockAt;
        return {
          id: p.id,
          name: p.name,
          category: p.category.name,
          tracked,
          stock,
          lowStockAt: p.lowStockAt,
          low,
          price: p.price,
          cost: p.cost ?? null,
          stockValueRetail: tracked ? Math.round((p.stock as number) * p.price * 100) / 100 : 0,
          stockValueCost:
            tracked && p.cost != null ? Math.round((p.stock as number) * p.cost * 100) / 100 : 0,
          soldQty,
          soldValue: Math.round(soldValue * 100) / 100,
        };
      });

      const tracked = items.filter((i) => i.tracked);
      const totals = {
        trackedProducts: tracked.length,
        lowCount: tracked.filter((i) => i.low).length,
        outCount: tracked.filter((i) => i.stock === 0).length,
        stockUnits: tracked.reduce((a, i) => a + (i.stock ?? 0), 0),
        stockValueRetail: Math.round(tracked.reduce((a, i) => a + i.stockValueRetail, 0) * 100) / 100,
        stockValueCost: Math.round(tracked.reduce((a, i) => a + i.stockValueCost, 0) * 100) / 100,
        soldUnits: items.reduce((a, i) => a + i.soldQty, 0),
        soldValue: Math.round(items.reduce((a, i) => a + i.soldValue, 0) * 100) / 100,
      };

      return { windowDays, since: since.toISOString().slice(0, 10), totals, items };
    }
  );
}
