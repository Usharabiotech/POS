import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { cartItemSchema } from "@cafepos/shared";
import { requireAuth } from "../auth.js";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { createOrder, quoteOrder, settleOrder, OrderError } from "../services/order.js";

/**
 * Razorpay gateway (UPI / cards / QR) for POS and kiosk.
 *
 * REAL: set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (test or live). Flow —
 *   1) client POST /payments/razorpay/init  → we create a Razorpay order, return its id
 *   2) client opens Razorpay Checkout, customer pays
 *   3) client POST /payments/razorpay/confirm → we VERIFY the signature, then create
 *      the CafePOS order as prepaid (ONLINE). Signature check is what makes it trustworthy.
 *
 * MOCK: with no keys (dev only), init/confirm short-circuit so the whole flow can be
 * demoed without real money. Mock is refused in production.
 */
const gatewayEnabled = () => !!(env.razorpayKeyId && env.razorpayKeySecret);
const mockAllowed = () => env.nodeEnv !== "production" || process.env.PAYMENTS_MOCK === "true";

export async function paymentRoutes(app: FastifyInstance) {
  // What the client needs to render the pay button.
  app.get("/payments/config", async () => ({
    provider: "razorpay",
    enabled: gatewayEnabled(),
    mock: !gatewayEnabled() && mockAllowed(),
    keyId: gatewayEnabled() ? env.razorpayKeyId : null,
    currency: env.currency,
  }));

  const draftSchema = z.object({
    items: z.array(cartItemSchema).min(1),
    discount: z.number().nonnegative().default(0),
  });

  // 1) Create a Razorpay order for the cart's amount.
  app.post("/payments/razorpay/init", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid cart" });
    try {
      const q = await quoteOrder(parsed.data.items, parsed.data.discount);

      if (!gatewayEnabled()) {
        if (!mockAllowed()) return reply.code(503).send({ error: "Payments not configured" });
        return { mock: true, razorpayOrderId: `mock_${Date.now()}`, amount: q.amountPaise, keyId: null };
      }

      const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: q.amountPaise,
          currency: env.currency,
          receipt: `rcpt_${Date.now()}`,
        }),
      });
      if (!res.ok) {
        app.log.error({ status: res.status, body: await res.text() }, "razorpay order failed");
        return reply.code(502).send({ error: "Gateway error creating order" });
      }
      const order = (await res.json()) as { id: string };
      return { mock: false, razorpayOrderId: order.id, amount: q.amountPaise, keyId: env.razorpayKeyId };
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  const confirmSchema = z.object({
    items: z.array(cartItemSchema).min(1),
    discount: z.number().nonnegative().default(0),
    source: z.enum(["POS", "KIOSK"]).default("POS"),
    customerPhone: z.string().optional(),
    customerName: z.string().optional(),
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string().optional(),
    razorpaySignature: z.string().optional(),
    mock: z.boolean().optional(),
  });

  // ── Kiosk UPI: pay on-screen (QR / WhatsApp link) with a payment handshake ──
  // Start a UPI payment for an AWAITING_PAYMENT order. Real mode creates a Razorpay
  // Payment Link (has a short_url we render as a QR and can send on WhatsApp); mock
  // mode returns a placeholder so the flow demos without keys.
  app.post("/payments/upi/start", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ orderId: z.string() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "orderId required" });
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      include: { customer: true },
    });
    if (!order) return reply.code(404).send({ error: "Order not found" });
    if (order.paid) return { paid: true };

    if (!gatewayEnabled()) {
      if (!mockAllowed()) return reply.code(503).send({ error: "Payments not configured" });
      // Placeholder UPI intent so the kiosk can render a realistic QR in demo mode.
      const upiLink = `upi://pay?pa=demo@cafepos&pn=${encodeURIComponent(env.storeName)}&am=${order.total}&cu=INR&tn=Order${order.number}`;
      return { mock: true, url: upiLink, amount: order.total };
    }

    const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Math.round(order.total * 100),
        currency: env.currency,
        accept_partial: false,
        description: `Order #${order.number}`,
        customer: { name: order.customerName ?? undefined, contact: order.customer?.phone ?? undefined },
        notify: { sms: false, email: false },
        upi_link: true,
      }),
    });
    if (!res.ok) {
      app.log.error({ status: res.status, body: await res.text() }, "razorpay link failed");
      return reply.code(502).send({ error: "Gateway error creating payment link" });
    }
    const link = (await res.json()) as { id: string; short_url: string };
    await prisma.order.update({ where: { id: order.id }, data: { gatewayOrderId: link.id } });
    return { mock: false, url: link.short_url, amount: order.total, linkId: link.id };
  });

  // Poll target for the kiosk. In real mode it reconciles with Razorpay and settles
  // the order the moment the link is paid — this is the "handshake" that releases it
  // to the kitchen. In mock mode it just reflects the order's current state.
  app.get("/payments/upi/status/:orderId", { preHandler: requireAuth }, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return reply.code(404).send({ error: "Not found" });
    if (order.paid) return { paid: true, number: order.number };

    if (gatewayEnabled() && order.gatewayOrderId) {
      const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");
      const res = await fetch(`https://api.razorpay.com/v1/payment_links/${order.gatewayOrderId}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (res.ok) {
        const link = (await res.json()) as { status: string };
        if (link.status === "paid") {
          const settled = await settleOrder(orderId, "UPI");
          return { paid: true, number: settled?.number };
        }
      }
    }
    return { paid: false, number: order.number };
  });

  // Demo-only: simulate the UPI money landing so the handshake can be shown without
  // real keys. Refused when a real gateway is configured or in production.
  app.post("/payments/upi/mock-pay/:orderId", { preHandler: requireAuth }, async (req, reply) => {
    if (gatewayEnabled() || !mockAllowed()) {
      return reply.code(403).send({ error: "Mock payment not allowed" });
    }
    const { orderId } = req.params as { orderId: string };
    try {
      const order = await settleOrder(orderId, "UPI");
      return { paid: true, number: order?.number };
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });

  // 2) Verify payment, then create the (prepaid) CafePOS order.
  app.post("/payments/razorpay/confirm", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = confirmSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid confirmation" });
    const b = parsed.data;

    const useMock = !gatewayEnabled() && !!b.mock;
    if (useMock && !mockAllowed()) {
      return reply.code(503).send({ error: "Payments not configured" });
    }

    if (!useMock) {
      // Trust the payment only if the HMAC signature matches — this is the security gate.
      if (!b.razorpayPaymentId || !b.razorpaySignature) {
        return reply.code(400).send({ error: "Missing payment reference" });
      }
      const expected = crypto
        .createHmac("sha256", env.razorpayKeySecret)
        .update(`${b.razorpayOrderId}|${b.razorpayPaymentId}`)
        .digest("hex");
      if (expected !== b.razorpaySignature) {
        return reply.code(400).send({ error: "Payment signature verification failed" });
      }
    }

    try {
      const { order } = await createOrder({
        source: b.source,
        items: b.items,
        discount: b.discount,
        cashierId: b.source === "POS" ? req.user!.id : undefined,
        customerPhone: b.customerPhone,
        customerName: b.customerName,
        prepaidOnline: true,
        externalRef: b.razorpayPaymentId ?? b.razorpayOrderId,
      });
      return reply.code(201).send({ order });
    } catch (e) {
      if (e instanceof OrderError) return reply.code(e.code).send({ error: e.message });
      throw e;
    }
  });
}
