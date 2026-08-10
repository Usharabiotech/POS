import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";
import { kdsRoutes } from "./routes/kds.js";
import { reportRoutes } from "./routes/reports.js";
import { userRoutes } from "./routes/users.js";
import { kioskRoutes } from "./routes/kiosk.js";
import { channelRoutes } from "./routes/channels.js";
import { paymentRoutes } from "./routes/payments.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { prisma } from "./db.js";

const app = Fastify({
  logger:
    env.nodeEnv === "development"
      ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }
      : true,
});

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, { origin: env.corsOrigins, credentials: true });

// Tolerate empty JSON bodies (some POSTs like settle/mock-pay carry no payload).
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  const s = body as string;
  if (!s || s.trim() === "") return done(null, {});
  try {
    done(null, JSON.parse(s));
  } catch (err) {
    done(err as Error, undefined);
  }
});

app.get("/api/health", async () => ({
  ok: true,
  store: env.storeName,
  taxRate: env.taxRate,
  currency: env.currency,
}));

// Public store config the client reads before login (name, tax, currency, kiosk PIN).
app.get("/api/config", async () => ({
  storeName: env.storeName,
  taxRate: env.taxRate,
  currency: env.currency,
  kioskPin: env.kioskPin,
}));

await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(catalogRoutes, { prefix: "/api" });
await app.register(orderRoutes, { prefix: "/api" });
await app.register(kdsRoutes, { prefix: "/api" });
await app.register(reportRoutes, { prefix: "/api" });
await app.register(userRoutes, { prefix: "/api" });
await app.register(kioskRoutes, { prefix: "/api" });
await app.register(channelRoutes, { prefix: "/api" });
await app.register(paymentRoutes, { prefix: "/api" });
await app.register(inventoryRoutes, { prefix: "/api" });

// Single-container production: serve the built SPA from the same process (cheap hosting).
if (env.publicDir) {
  const { default: fastifyStatic } = await import("@fastify/static");
  await app.register(fastifyStatic, { root: env.publicDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) return reply.code(404).send({ error: "Not found" });
    return reply.sendFile("index.html");
  });
}

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await app.listen({ port: env.port, host: env.host });
  app.log.info(`CafePOS API on http://${env.host}:${env.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
