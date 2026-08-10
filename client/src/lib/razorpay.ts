import { api } from "../api";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

/** Inject Razorpay Checkout once. (Real gateway only — skipped in mock mode.) */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(s);
  });
  return loading;
}

export interface PayArgs {
  items: { productId: string; qty: number }[];
  discount?: number;
  source: "POS" | "KIOSK";
  customerName?: string;
  customerPhone?: string;
  storeName: string;
}

export class PaymentCancelled extends Error {
  constructor() {
    super("Payment cancelled");
  }
}

/**
 * Full pay-then-create flow. Returns the created (paid) CafePOS order.
 * Mock mode (no keys, dev): skips Checkout and confirms straight through so the
 * flow is demoable. Real mode: opens Razorpay Checkout and the server verifies the
 * signature before the order is created.
 */
export async function payWithRazorpay(args: PayArgs): Promise<any> {
  const cfg = (await api.get("/payments/config")).data as {
    enabled: boolean;
    mock: boolean;
    currency: string;
  };
  const init = (
    await api.post("/payments/razorpay/init", { items: args.items, discount: args.discount ?? 0 })
  ).data as { mock: boolean; razorpayOrderId: string; amount: number; keyId: string | null };

  const base = {
    items: args.items,
    discount: args.discount ?? 0,
    source: args.source,
    customerName: args.customerName,
    customerPhone: args.customerPhone,
    razorpayOrderId: init.razorpayOrderId,
  };

  if (init.mock) {
    const { data } = await api.post("/payments/razorpay/confirm", { ...base, mock: true });
    return data.order;
  }

  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: init.keyId,
      order_id: init.razorpayOrderId,
      amount: init.amount,
      currency: cfg.currency || "INR",
      name: args.storeName,
      description: "Cafe order",
      prefill: {
        name: args.customerName || "",
        contact: args.customerPhone || "",
      },
      theme: { color: "#15703d" },
      handler: async (resp: any) => {
        try {
          const { data } = await api.post("/payments/razorpay/confirm", {
            ...base,
            razorpayPaymentId: resp.razorpay_payment_id,
            razorpaySignature: resp.razorpay_signature,
          });
          resolve(data.order);
        } catch (e) {
          reject(e);
        }
      },
      modal: { ondismiss: () => reject(new PaymentCancelled()) },
    });
    rzp.open();
  });
}
