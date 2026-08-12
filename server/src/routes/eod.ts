import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { requireAuth, requireRole } from "../auth.js";

/** Local YYYY-MM-DD for a date. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function dayBounds(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Compute the aggregate for a local day from its paid, non-cancelled orders. */
async function computeDay(dateStr: string) {
  const { start, end } = dayBounds(dateStr);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" }, paid: true },
    include: { items: true, payment: true },
  });
  let sales = 0, tax = 0, discount = 0;
  const byMethod: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0, ONLINE: 0 };
  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  const hourly: number[] = Array(24).fill(0);
  for (const o of orders) {
    sales += o.total;
    tax += o.tax;
    discount += o.discount;
    if (o.payment) byMethod[o.payment.method] = (byMethod[o.payment.method] ?? 0) + o.total;
    hourly[new Date(o.createdAt).getHours()] += o.total;
    for (const it of o.items) {
      const e = itemMap[it.productId] ?? { name: it.name, qty: 0, revenue: 0 };
      e.qty += it.qty;
      e.revenue += it.lineTotal;
      itemMap[it.productId] = e;
    }
  }
  const topItems = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 10);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    date: dateStr,
    orderCount: orders.length,
    sales: round(sales),
    tax: round(tax),
    discount: round(discount),
    byMethod,
    topItems,
    hourly,
  };
}

async function saveSummary(dateStr: string) {
  const s = await computeDay(dateStr);
  await prisma.dailySummary.upsert({
    where: { date: dateStr },
    update: {
      orderCount: s.orderCount, sales: s.sales, tax: s.tax, discount: s.discount,
      byMethod: s.byMethod, topItems: s.topItems, hourly: s.hourly, closedAt: new Date(),
    },
    create: {
      date: dateStr, orderCount: s.orderCount, sales: s.sales, tax: s.tax, discount: s.discount,
      byMethod: s.byMethod, topItems: s.topItems, hourly: s.hourly,
    },
  });
  return s;
}

export async function eodRoutes(app: FastifyInstance) {
  // Everything the client needs to build the day's downloadable ZIP (report + invoices + CSV).
  app.get("/eod/data", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const { date } = req.query as { date?: string };
    const dateStr = date ?? localDay(new Date());
    const { start, end } = dayBounds(dateStr);
    const summary = await computeDay(dateStr);
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { number: "asc" },
      include: { items: true, payment: true, customer: true, cashier: { select: { name: true } } },
    });
    return { date: dateStr, storeName: env.storeName, taxRate: env.taxRate, summary, orders };
  });

  // Close the day: persist the summary (survives purge) and purge detail past the window.
  app.post("/eod/close", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const { date } = req.query as { date?: string };
    const dateStr = date ?? localDay(new Date());
    const summary = await saveSummary(dateStr);

    // Purge: remove detailed orders older than the retention window, but only after
    // making sure each of those days has a saved summary (no aggregate is ever lost).
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - env.retentionDays);

    const old = await prisma.order.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { createdAt: true },
    });
    const oldDays = [...new Set(old.map((o) => localDay(new Date(o.createdAt))))];
    const haveSummaries = new Set(
      (await prisma.dailySummary.findMany({ where: { date: { in: oldDays } }, select: { date: true } })).map(
        (s) => s.date
      )
    );
    for (const d of oldDays) if (!haveSummaries.has(d)) await saveSummary(d);

    const purged = await prisma.order.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return { date: dateStr, summary, retentionDays: env.retentionDays, purgedOrders: purged.count };
  });

  // Long-term history straight from the saved summaries (tiny — survives purge).
  app.get("/eod/history", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const { limit } = req.query as { limit?: string };
    const summaries = await prisma.dailySummary.findMany({
      orderBy: { date: "desc" },
      take: Math.min(Number(limit ?? 90), 400),
    });
    // Roll the daily rows up into per-month totals too.
    const months: Record<string, { sales: number; tax: number; orders: number }> = {};
    for (const s of summaries) {
      const m = s.date.slice(0, 7);
      const e = months[m] ?? { sales: 0, tax: 0, orders: 0 };
      e.sales += s.sales;
      e.tax += s.tax;
      e.orders += s.orderCount;
      months[m] = e;
    }
    return {
      days: summaries,
      months: Object.entries(months).map(([month, v]) => ({
        month,
        sales: Math.round(v.sales * 100) / 100,
        tax: Math.round(v.tax * 100) / 100,
        orders: v.orders,
      })),
    };
  });
}
