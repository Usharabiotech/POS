import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { storeDayBounds, storeHour, storeDayLabel } from "../lib/day.js";

const round = (n: number) => Math.round(n * 100) / 100;

/** All store-local YYYY-MM-DD dates from..to inclusive (capped for safety). */
function dateList(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = storeDayBounds(from).start;
  const last = storeDayBounds(to).start;
  for (let i = 0; i < 800 && cur <= last; i++) {
    out.push(storeDayLabel(new Date(cur.getTime() + 12 * 3600 * 1000))); // midday to dodge DST edges
    cur = new Date(cur.getTime() + 24 * 3600 * 1000);
  }
  return out;
}

export async function reportRoutes(app: FastifyInstance) {
  // Day summary for the dashboard / day-close: totals, payment mix, top items, hourly.
  app.get("/reports/summary", { preHandler: requireAuth }, async (req) => {
    const { date, storeId } = req.query as { date?: string; storeId?: string };
    const { start, end, label } = storeDayBounds(date);

    // Only settled money counts as sales — matches the EOD record. Unpaid
    // (AWAITING_PAYMENT) and cancelled orders are excluded.
    // No storeId → cumulative across all branches; storeId → that branch only.
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        paid: true,
        status: { not: "CANCELLED" },
        ...(storeId ? { storeId } : {}),
      },
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
      hourly[storeHour(o.createdAt)] += o.total;
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

  // Custom date-range sales dashboard (admin). Correct across the purge window:
  // closed days come from their saved DailySummary; not-yet-closed days (and any day
  // without a summary) are computed live from paid orders. A date is counted once.
  app.get("/reports/range", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req) => {
    const q = req.query as { from?: string; to?: string; storeId?: string };
    const today = storeDayLabel();
    let from = q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from) ? q.from : today;
    let to = q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to : today;
    if (from > to) [from, to] = [to, from];
    const storeId = q.storeId;

    // Saved summaries win for the days they cover (survive purge).
    const summaries = await prisma.dailySummary.findMany({
      where: { date: { gte: from, lte: to }, ...(storeId ? { storeId } : {}) },
    });
    const summarized = new Set(summaries.map((s) => s.date));

    // Live paid orders across the whole window — used only for days without a summary.
    const { start } = storeDayBounds(from);
    const { end } = storeDayBounds(to);
    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        paid: true,
        status: { not: "CANCELLED" },
        ...(storeId ? { storeId } : {}),
      },
      include: { items: true, payment: true },
    });

    const perDay: Record<string, { sales: number; tax: number; discount: number; orders: number }> = {};
    const byMethod: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0, ONLINE: 0 };
    const items: Record<string, { name: string; qty: number; revenue: number }> = {};
    const addItem = (name: string, qty: number, revenue: number) => {
      const e = items[name] ?? { name, qty: 0, revenue: 0 };
      e.qty += qty;
      e.revenue += revenue;
      items[name] = e;
    };

    // 1) Saved summaries.
    for (const s of summaries) {
      const d = (perDay[s.date] ??= { sales: 0, tax: 0, discount: 0, orders: 0 });
      d.sales += s.sales; d.tax += s.tax; d.discount += s.discount; d.orders += s.orderCount;
      const bm = (s.byMethod as Record<string, number>) ?? {};
      for (const [m, v] of Object.entries(bm)) byMethod[m] = (byMethod[m] ?? 0) + (v ?? 0);
      const ti = (s.topItems as { name: string; qty: number; revenue: number }[]) ?? [];
      for (const it of ti) addItem(it.name, it.qty, it.revenue);
    }

    // 2) Live orders, but only for days that have no saved summary (avoid double count).
    for (const o of orders) {
      const day = storeDayLabel(o.createdAt);
      if (summarized.has(day)) continue;
      const d = (perDay[day] ??= { sales: 0, tax: 0, discount: 0, orders: 0 });
      d.sales += o.total; d.tax += o.tax; d.discount += o.discount; d.orders += 1;
      if (o.payment) byMethod[o.payment.method] = (byMethod[o.payment.method] ?? 0) + o.total;
      for (const it of o.items) addItem(it.name, it.qty, it.lineTotal);
    }

    const daily = dateList(from, to).map((date) => {
      const d = perDay[date] ?? { sales: 0, tax: 0, discount: 0, orders: 0 };
      return { date, sales: round(d.sales), orders: d.orders };
    });
    const totalSales = daily.reduce((s, d) => s + d.sales, 0);
    const totalOrders = daily.reduce((s, d) => s + d.orders, 0);
    const totalTax = Object.values(perDay).reduce((s, d) => s + d.tax, 0);
    const totalDiscount = Object.values(perDay).reduce((s, d) => s + d.discount, 0);
    const topItems = Object.values(items).sort((a, b) => b.qty - a.qty).slice(0, 10)
      .map((i) => ({ name: i.name, qty: i.qty, revenue: round(i.revenue) }));
    for (const k of Object.keys(byMethod)) byMethod[k] = round(byMethod[k]);

    return {
      from, to,
      sales: round(totalSales),
      tax: round(totalTax),
      discount: round(totalDiscount),
      orderCount: totalOrders,
      avgOrder: totalOrders ? round(totalSales / totalOrders) : 0,
      byMethod,
      topItems,
      daily,
    };
  });
}
