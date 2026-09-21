import { z } from "zod";

/** How an item behaves at checkout. */
export const ProductKind = {
  /** Ready-made (80-90% of a fruit cafe): completes instantly on payment, no kitchen ticket. */
  READYMADE: "READYMADE",
  /** Freshly prepared: fires a Kitchen Display ticket after payment. */
  PREPARED: "PREPARED",
} as const;
export type ProductKind = (typeof ProductKind)[keyof typeof ProductKind];

export const OrderSource = {
  POS: "POS",
  KIOSK: "KIOSK",
  QR: "QR",
  SWIGGY: "SWIGGY",
  ZOMATO: "ZOMATO",
} as const;
export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource];

/** Delivery-aggregator channels that arrive via webhook and alert the till. */
export const ONLINE_SOURCES: OrderSource[] = [OrderSource.SWIGGY, OrderSource.ZOMATO];

export const OrderStatus = {
  /** Paid; all items ready-made — nothing to prepare. */
  COMPLETED: "COMPLETED",
  /** Paid; has prepared items still being made in the kitchen. */
  PREPARING: "PREPARING",
  CANCELLED: "CANCELLED",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Per-line kitchen status (only meaningful for PREPARED items). */
export const KdsStatus = {
  PENDING: "PENDING",
  PREPARING: "PREPARING",
  READY: "READY",
  COMPLETED: "COMPLETED",
} as const;
export type KdsStatus = (typeof KdsStatus)[keyof typeof KdsStatus];

export const PaymentMethod = {
  CASH: "CASH",
  UPI: "UPI",
  CARD: "CARD",
  ONLINE: "ONLINE",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const Role = {
  ADMIN: "ADMIN",
  CASHIER: "CASHIER",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

// ── API request validation ──────────────────────────────────────────────────

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ── Password strength ─────────────────────────────────────────────────────────
// The repo is public, so the seeded defaults (admin123 / cashier123) are known to
// anyone. Block those and the usual breach-list passwords so a real deployment can
// never keep a guessable login. Shared so the client can validate before submit and
// the server can enforce it as the source of truth.
const WEAK_PASSWORDS = new Set(
  [
    "admin123",
    "cashier123",
    "password",
    "password1",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty123",
    "admin@123",
    "welcome1",
    "changeme",
    "letmein1",
    "iloveyou",
    "abcd1234",
    "kamala123",
  ].map((p) => p.toLowerCase())
);

/** Returns an error message if the password is too weak, else null. */
export function passwordProblem(password: string): string | null {
  const p = password ?? "";
  if (p.length < 8) return "Use at least 8 characters.";
  if (!/[a-zA-Z]/.test(p)) return "Add at least one letter.";
  if (!/[0-9]/.test(p)) return "Add at least one number.";
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return "That password is too common — pick a unique one.";
  if (/^(.)\1+$/.test(p)) return "Don't repeat a single character.";
  return null;
}

/** Zod field for any password a user sets (creation / reset / change). */
export const strongPasswordSchema = z
  .string()
  .refine((p) => passwordProblem(p) === null, (p) => ({ message: passwordProblem(p) ?? "Weak password" }));

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().int().positive(),
  /** Chosen ModifierOption ids (size, add-ons, choices). Priced + labelled server-side. */
  optionIds: z.array(z.string()).optional(),
  /** Legacy free-text modifiers (still accepted for display). */
  modifiers: z.array(z.string()).optional(),
  note: z.string().optional(),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const ModifierSelect = { SINGLE: "SINGLE", MULTI: "MULTI" } as const;
export type ModifierSelect = (typeof ModifierSelect)[keyof typeof ModifierSelect];

export const paymentSchema = z.object({
  method: z.enum([PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.CARD]),
  /** Cash tendered (for change calc); ignored for UPI/CARD. */
  tendered: z.number().nonnegative().optional(),
});

/** One-shot create-and-pay: a fruit cafe till rings and settles in a single tap. */
export const checkoutSchema = z.object({
  source: z
    .enum([OrderSource.POS, OrderSource.KIOSK, OrderSource.QR])
    .default(OrderSource.POS),
  items: z.array(cartItemSchema).min(1),
  /** Whole-bill discount in rupees (absolute), applied before tax. */
  discount: z.number().nonnegative().default(0),
  payment: paymentSchema,
  customerPhone: z.string().optional(),
  customerName: z.string().optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Tender chosen at the kiosk. CASH/CARD → pay at counter; UPI → pay on screen. */
export const KioskTender = {
  CASH: "CASH",
  CARD: "CARD",
  UPI: "UPI",
} as const;
export type KioskTender = (typeof KioskTender)[keyof typeof KioskTender];

/** Kiosk self-order. Customer details are captured before billing (required). */
export const kioskOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  customerName: z.string().trim().min(1, "Name is required"),
  customerPhone: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit phone number"),
  tender: z.enum([KioskTender.CASH, KioskTender.CARD, KioskTender.UPI]),
});
export type KioskOrderInput = z.infer<typeof kioskOrderSchema>;

/** Settle an awaiting-payment order once money is received. */
export const settleSchema = z.object({
  method: z.enum([PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.UPI, PaymentMethod.ONLINE]),
});

/** Inbound Swiggy/Zomato order (via webhook or the built-in simulator).
 *  Items reference our productIds — the platform menu is mapped to the catalog
 *  during integration onboarding. `total` from the platform is stored for
 *  reconciliation but the bill is recomputed from our prices. */
export const channelOrderSchema = z.object({
  platform: z.enum([OrderSource.SWIGGY, OrderSource.ZOMATO]),
  externalRef: z.string().min(1),
  customerName: z.string().optional(),
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() })).min(1),
  platformTotal: z.number().nonnegative().optional(),
});
export type ChannelOrderInput = z.infer<typeof channelOrderSchema>;

export const kdsUpdateSchema = z.object({
  status: z.enum([
    KdsStatus.PENDING,
    KdsStatus.PREPARING,
    KdsStatus.READY,
    KdsStatus.COMPLETED,
  ]),
});

/** GST-style tax rate applied to the whole bill (single-store default). Overridable via env. */
export const DEFAULT_TAX_RATE = 0.05;

/** Rupee formatter used across the client. */
export function formatMoney(paiseOrRupees: number): string {
  return "₹" + paiseOrRupees.toFixed(2);
}
