import type { OrderSource, PaymentMethod } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";

export interface CreateOrderItem {
  productId: string;
  qty: number;
  modifiers?: string[];
  note?: string;
}

export interface CreateOrderInput {
  source: OrderSource;
  items: CreateOrderItem[];
  discount?: number;
  cashierId?: string;
  customerPhone?: string;
  customerName?: string;
  /** Present for POS (Cash/UPI/Card). Omit for kiosk (pay at counter). */
  payment?: { method: PaymentMethod; tendered?: number };
  /** Online channels: mark prepaid + store platform order id. */
  externalRef?: string;
  prepaidOnline?: boolean;
  /** Hold the order as AWAITING_PAYMENT — not paid, NOT sent to the kitchen yet,
   *  stock not deducted. Settled later via settleOrder() (counter cash/card or UPI). */
  awaitPayment?: boolean;
  /** Chosen tender label (CASH/CARD/UPI) recorded while awaiting payment. */
  tender?: string;
  /** Razorpay order id to poll while awaiting a UPI payment. */
  gatewayOrderId?: string;
}

export class OrderError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

/** Price a cart server-side (no order created) — used to open a Razorpay order. */
export async function quoteOrder(items: CreateOrderItem[], discountInput = 0) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));
  let subtotal = 0;
  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || !p.active) throw new OrderError(400, `Product unavailable: ${item.productId}`);
    subtotal += p.price * item.qty;
  }
  const discount = Math.min(discountInput, subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * env.taxRate * 100) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;
  return { subtotal, discount, tax, total, amountPaise: Math.round(total * 100) };
}

const ONLINE: OrderSource[] = ["SWIGGY", "ZOMATO"];

/**
 * Single validated path for creating an order from any channel.
 * - POS: ready-made items complete instantly; only prepared items open KDS tickets.
 * - Kiosk / Swiggy / Zomato: the WHOLE order goes to the kitchen to assemble/pack.
 */
export async function createOrder(input: CreateOrderInput) {
  const isOnline = ONLINE.includes(input.source);
  const wholeOrderToKitchen = input.source !== "POS"; // kiosk + online → pack everything

  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  for (const item of input.items) {
    const p = byId.get(item.productId);
    if (!p || !p.active) {
      throw new OrderError(400, `Product unavailable: ${item.productId}`);
    }
  }

  // Total qty per product for the stock check/deduction.
  const qtyByProduct = new Map<string, number>();
  for (const item of input.items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + item.qty);
  }
  // In-store channels reject oversell; aggregator orders are already placed, so allow it.
  if (!isOnline) {
    for (const [pid, qty] of qtyByProduct) {
      const p = byId.get(pid)!;
      if (p.stock !== null && qty > p.stock) {
        throw new OrderError(409, `Out of stock: ${p.name} (have ${p.stock})`);
      }
    }
  }

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const p = byId.get(item.productId)!;
    const lineTotal = p.price * item.qty;
    subtotal += lineTotal;
    const kdsStatus =
      wholeOrderToKitchen || p.kind === "PREPARED" ? "PENDING" : "COMPLETED";
    return {
      productId: p.id,
      name: p.name,
      kind: p.kind,
      unitPrice: p.price,
      qty: item.qty,
      modifiers: item.modifiers ?? [],
      note: item.note,
      lineTotal,
      kdsStatus: kdsStatus as "PENDING" | "COMPLETED",
    };
  });

  const discount = Math.min(input.discount ?? 0, subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round(taxable * env.taxRate * 100) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;

  const anyPending = lines.some((l) => l.kdsStatus === "PENDING");

  // Payment. An order is "paid" only when a real payment is attached at creation
  // (POS cash/UPI/card, or a prepaid online channel). Kiosk cash/card and pending
  // UPI orders are held as AWAITING_PAYMENT and settled later via settleOrder().
  let paymentData:
    | { method: PaymentMethod; amount: number; tendered: number | null; change: number }
    | undefined;
  let change = 0;
  let paid = false;
  if (!input.awaitPayment && input.payment) {
    const method = input.payment.method;
    const tendered = method === "CASH" ? input.payment.tendered ?? total : total;
    if (method === "CASH" && tendered < total) {
      throw new OrderError(400, "Cash tendered is less than total");
    }
    change = method === "CASH" ? Math.round((tendered - total) * 100) / 100 : 0;
    paymentData = { method, amount: total, tendered, change };
    paid = true;
  } else if (!input.awaitPayment && input.prepaidOnline) {
    paymentData = { method: "ONLINE", amount: total, tendered: null, change: 0 };
    paid = true;
  }

  // Unpaid orders wait for payment and do NOT reach the kitchen.
  const status = !paid ? "AWAITING_PAYMENT" : anyPending ? "PREPARING" : "COMPLETED";

  // Customer + loyalty. Always link the customer; award visits/points only once paid.
  let customerId: string | undefined;
  if (input.customerPhone) {
    const points = paid ? Math.floor(total / 10) : 0;
    const customer = await prisma.customer.upsert({
      where: { phone: input.customerPhone },
      update: {
        ...(paid ? { visits: { increment: 1 }, points: { increment: points } } : {}),
        ...(input.customerName ? { name: input.customerName } : {}),
      },
      create: { phone: input.customerPhone, name: input.customerName, visits: paid ? 1 : 0, points },
    });
    customerId = customer.id;
  }

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        source: input.source,
        status,
        subtotal,
        discount,
        tax,
        total,
        paid,
        tender: input.tender ?? paymentData?.method,
        gatewayOrderId: input.gatewayOrderId,
        customerName: input.customerName,
        externalRef: input.externalRef,
        cashierId: input.cashierId,
        customerId,
        items: { create: lines },
        ...(paymentData ? { payment: { create: paymentData } } : {}),
      },
      include: { items: true, payment: true, customer: true },
    });

    // Stock leaves inventory only when the order is actually paid.
    if (paid) {
      for (const [pid, qty] of qtyByProduct) {
        const p = byId.get(pid)!;
        if (p.stock !== null) {
          const dec = isOnline ? Math.min(qty, p.stock) : qty;
          if (dec > 0) {
            await tx.product.update({ where: { id: pid }, data: { stock: { decrement: dec } } });
          }
        }
      }
    }
    return created;
  });

  return { order, change };
}

/**
 * Settle an AWAITING_PAYMENT order once the money is confirmed (counter cash/card,
 * or a verified UPI/gateway payment). Attaches the payment, deducts stock, awards
 * loyalty, and flips the order into the kitchen. Idempotent.
 */
export async function settleOrder(orderId: string, method: PaymentMethod) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new OrderError(404, "Order not found");
    if (order.paid) {
      return tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payment: true, customer: true },
      });
    }

    await tx.payment.create({
      data: {
        orderId,
        method,
        amount: order.total,
        tendered: method === "CASH" ? order.total : null,
        change: 0,
      },
    });

    // Deduct finished-goods stock now that payment landed.
    const qtyByProduct = new Map<string, number>();
    for (const it of order.items) {
      qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) ?? 0) + it.qty);
    }
    for (const [pid, qty] of qtyByProduct) {
      const p = await tx.product.findUnique({ where: { id: pid } });
      if (p && p.stock !== null) {
        await tx.product.update({
          where: { id: pid },
          data: { stock: { decrement: Math.min(qty, p.stock) } },
        });
      }
    }

    if (order.customerId) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: { visits: { increment: 1 }, points: { increment: Math.floor(order.total / 10) } },
      });
    }

    const anyPending = order.items.some((i) => i.kdsStatus !== "COMPLETED");
    return tx.order.update({
      where: { id: orderId },
      data: { paid: true, tender: method, status: anyPending ? "PREPARING" : "COMPLETED" },
      include: { items: true, payment: true, customer: true },
    });
  });
}
