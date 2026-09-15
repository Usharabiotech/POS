import { prisma } from "../db.js";
import { env } from "../env.js";

let cachedDefault: string | null = null;

/** The single/primary store's id. Self-heals: creates one from STORE_NAME if none exists. */
export async function getDefaultStoreId(): Promise<string> {
  if (cachedDefault) return cachedDefault;
  let store = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
  if (!store) store = await prisma.store.create({ data: { name: env.storeName, code: "MAIN" } });
  cachedDefault = store.id;
  return cachedDefault;
}

/** One-time backfill: stamp legacy rows (created before multi-store) onto the default store. */
export async function backfillStore(): Promise<void> {
  const storeId = await getDefaultStoreId();
  await prisma.order.updateMany({ where: { storeId: null }, data: { storeId } });
  await prisma.dailySummary.updateMany({ where: { storeId: null }, data: { storeId } });
}
