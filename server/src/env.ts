import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  jwtSecret: req("JWT_SECRET", "dev-secret-change-me"),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "12h",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  storeName: process.env.STORE_NAME ?? "Fresh Fruit Cafe",
  taxRate: Number(process.env.TAX_RATE ?? 0.05),
  currency: process.env.CURRENCY ?? "INR",
  // PIN a manager/cashier enters to unlock the kiosk menu (exit / windowed).
  kioskPin: process.env.KIOSK_PIN ?? "1010",
  // Keep this many days of DETAILED orders in the cloud; older ones are purged after
  // their daily summary is saved (the full copy lives in the local EOD archive).
  retentionDays: Number(process.env.RETENTION_DAYS ?? 45),
  // Shared secret Swiggy/Zomato send in the x-channel-secret header on the webhook.
  channelWebhookSecret: process.env.CHANNEL_WEBHOOK_SECRET ?? "",
  // Razorpay payment gateway (UPI / cards / QR). Blank keys → gateway runs in mock
  // mode (dev only) so the flow is demoable before real keys are added.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  publicDir: process.env.PUBLIC_DIR, // set in single-container prod to serve the SPA
};
