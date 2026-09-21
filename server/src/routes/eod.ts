import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { requireAuth, requireRole } from "../auth.js";
import { getDefaultStoreId } from "../services/store.js";
import { storeDayLabel, storeDayBounds, storeHour } from "../lib/day.js";

/** Compute the aggregate for a store-local day from its paid, non-cancelled orders.
 *  Pass a storeId for a per-branch summary; omit for cumulative (all stores). */
async function computeDay(dateStr: string, storeId?: string) {
  const { start, end } = storeDayBounds(dateStr);
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      status: { not: "CANCELLED" },
      paid: true,
      ...(storeId ? { storeId } : {}),
    },
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
    hourly[storeHour(o.createdAt)] += o.total;
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

async function saveSummary(dateStr: string, storeId: string) {
  const s = await computeDay(dateStr, storeId);
  await prisma.dailySummary.upsert({
    where: { storeId_date: { storeId, date: dateStr } },
    update: {
      orderCount: s.orderCount, sales: s.sales, tax: s.tax, discount: s.discount,
      byMethod: s.byMethod, topItems: s.topItems, hourly: s.hourly, closedAt: new Date(),
    },
    create: {
      storeId, date: dateStr, orderCount: s.orderCount, sales: s.sales, tax: s.tax,
      discount: s.discount, byMethod: s.byMethod, topItems: s.topItems, hourly: s.hourly,
    },
  });
  return s;
}

export async function eodRoutes(app: FastifyInstance) {
  // Everything the client needs to build the day's downloadable ZIP (report + invoices + CSV).
  app.get("/eod/data", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const { date } = req.query as { date?: string };
    const { start, end, label: dateStr } = storeDayBounds(date);
    const summary = await computeDay(dateStr);
    // Only paid, non-cancelled orders — so the invoice PDFs + CSV reconcile exactly
    // with the summary totals (abandoned/awaiting orders are not part of the record).
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lt: end }, paid: true, status: { not: "CANCELLED" } },
      orderBy: { number: "asc" },
      include: { items: true, payment: true, customer: true, cashier: { select: { name: true } } },
    });
    return { date: dateStr, storeName: env.storeName, taxRate: env.taxRate, summary, orders };
  });

  // Close the day: persist a per-store summary (survives purge) and purge detail past
  // the window. Summaries are saved per branch so reports can be cumulative or per-store.
  app.post("/eod/close", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const { date } = req.query as { date?: string };
    const { label: dateStr } = storeDayBounds(date);

    const stores = await prisma.store.findMany({ select: { id: true } });
    const storeIds = stores.length ? stores.map((s) => s.id) : [await getDefaultStoreId()];
    for (const sid of storeIds) await saveSummary(dateStr, sid);

    // Purge: remove detailed orders older than the retention window, but only after
    // making sure each of those days (per store) has a saved summary — no aggregate lost.
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - env.retentionDays);

    const old = await prisma.order.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { createdAt: true },
    });
    const oldDays = [...new Set(old.map((o) => storeDayLabel(new Date(o.createdAt))))];
    const have = new Set(
      (await prisma.dailySummary.findMany({
        where: { date: { in: oldDays } },
        select: { date: true, storeId: true },
      })).map((s) => `${s.storeId}|${s.date}`)
    );
    for (const d of oldDays) for (const sid of storeIds) if (!have.has(`${sid}|${d}`)) await saveSummary(d, sid);

    const purged = await prisma.order.deleteMany({ where: { createdAt: { lt: cutoff } } });
    return { date: dateStr, stores: storeIds.length, retentionDays: env.retentionDays, purgedOrders: purged.count };
  });

  // Long-term history from saved summaries (tiny — survives purge). Cumulative across
  // branches by default; pass ?storeId= for a single branch.
  app.get("/eod/history", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const { limit, storeId } = req.query as { limit?: string; storeId?: string };
    const rows = await prisma.dailySummary.findMany({
      where: storeId ? { storeId } : {},
      orderBy: { date: "desc" },
      take: Math.min(Number(limit ?? 400), 2000),
    });
    // Collapse per-store rows into one cumulative row per day.
    const byDate: Record<string, { date: string; sales: number; tax: number; orderCount: number }> = {};
    for (const s of rows) {
      const e = byDate[s.date] ?? { date: s.date, sales: 0, tax: 0, orderCount: 0 };
      e.sales += s.sales; e.tax += s.tax; e.orderCount += s.orderCount;
      byDate[s.date] = e;
    }
    const summaries = Object.values(byDate).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 90);
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
