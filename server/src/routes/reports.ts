import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

function dayRange(dateStr?: string) {
  const base = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  // Local YYYY-MM-DD label (not toISOString, which would shift a day in +tz like IST).
  const label = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate()
  ).padStart(2, "0")}`;
  return { start, end, label };
}

export async function reportRoutes(app: FastifyInstance) {
  // Day summary for the dashboard / day-close: totals, payment mix, top items, hourly.
  app.get("/reports/summary", { preHandler: requireAuth }, async (req) => {
    const { date } = req.query as { date?: string };
    const { start, end, label } = dayRange(date);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
      include: { items: true, payment: true },
    });

    let sales = 0;
    let tax = 0;
    let discount = 0;
    const byMethod: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0 };
    const itemCount: Record<string, { name: string; qty: number; revenue: number }> = {};
    const hourly: number[] = Array(24).fill(0);

    for (const o of orders) {
      sales += o.total;
      tax += o.tax;
      discount += o.discount;
      if (o.payment) byMethod[o.payment.method] = (byMethod[o.payment.method] ?? 0) + o.total;
      hourly[new Date(o.createdAt).getHours()] += o.total;
      for (const it of o.items) {
        const e = itemCount[it.productId] ?? { name: it.name, qty: 0, revenue: 0 };
        e.qty += it.qty;
        e.revenue += it.lineTotal;
        itemCount[it.productId] = e;
      }
    }

    const topItems = Object.values(itemCount)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);

    return {
      date: label,
      orderCount: orders.length,
      sales: Math.round(sales * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      avgOrder: orders.length ? Math.round((sales / orders.length) * 100) / 100 : 0,
      byMethod,
      topItems,
      hourly,
    };
  });
}
