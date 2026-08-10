import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export async function catalogRoutes(app: FastifyInstance) {
  // Full menu for the POS/kiosk: categories with their active products.
  app.get("/menu", { preHandler: requireAuth }, async () => {
    const categories = await prisma.category.findMany({
      where: { active: true },
      orderBy: { sort: "asc" },
      include: {
        products: {
          where: { active: true },
          orderBy: [{ sort: "asc" }, { name: "asc" }],
        },
      },
    });
    return { categories };
  });

  // Barcode/SKU lookup for the scanner.
  app.get("/products/by-barcode/:code", { preHandler: requireAuth }, async (req, reply) => {
    const { code } = req.params as { code: string };
    const product = await prisma.product.findFirst({
      where: { barcode: code, active: true },
    });
    if (!product) return reply.code(404).send({ error: "Not found" });
    return { product };
  });

  const upsertSchema = z.object({
    name: z.string().min(1),
    categoryId: z.string().min(1),
    kind: z.enum(["READYMADE", "PREPARED"]),
    price: z.number().nonnegative(),
    cost: z.number().nonnegative().nullable().optional(),
    barcode: z.string().optional().nullable(),
    stock: z.number().int().nullable().optional(),
    emoji: z.string().optional(),
    color: z.string().optional(),
    active: z.boolean().optional(),
    lowStockAt: z.number().int().optional(),
  });

  // Admin: create/update a product (simple catalog management).
  app.post(
    "/products",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (req, reply) => {
      const parsed = upsertSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });
      const product = await prisma.product.create({ data: parsed.data });
      return { product };
    }
  );

  app.patch(
    "/products/:id",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = upsertSchema.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });
      const product = await prisma.product.update({ where: { id }, data: parsed.data });
      return { product };
    }
  );

  // Admin: adjust finished-goods stock (restock / correction).
  app.post(
    "/products/:id/stock",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parsed = z.object({ delta: z.number().int() }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });
      const current = await prisma.product.findUnique({ where: { id } });
      if (!current) return reply.code(404).send({ error: "Not found" });
      if (current.stock === null) {
        return reply.code(400).send({ error: "Product does not track stock" });
      }
      const product = await prisma.product.update({
        where: { id },
        data: { stock: Math.max(0, current.stock + parsed.data.delta) },
      });
      return { product };
    }
  );

  // Admin: every product (incl. inactive) with category name, for the catalog manager.
  app.get(
    "/admin/products",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async () => {
      const products = await prisma.product.findMany({
        orderBy: [{ categoryId: "asc" }, { sort: "asc" }],
        include: { category: { select: { name: true, emoji: true } } },
      });
      return { products };
    }
  );

  // All categories (incl. inactive) for dropdowns / management.
  app.get("/admin/categories", { preHandler: [requireAuth, requireRole("ADMIN")] }, async () => {
    const categories = await prisma.category.findMany({ orderBy: { sort: "asc" } });
    return { categories };
  });

  app.post(
    "/admin/categories",
    { preHandler: [requireAuth, requireRole("ADMIN")] },
    async (req, reply) => {
      const parsed = z
        .object({ name: z.string().min(1), emoji: z.string().optional() })
        .safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });
      const count = await prisma.category.count();
      const category = await prisma.category.create({
        data: { name: parsed.data.name, emoji: parsed.data.emoji ?? "🍽️", sort: count },
      });
      return { category };
    }
  );

  // Low-stock alerts for the dashboard.
  app.get("/low-stock", { preHandler: requireAuth }, async () => {
    const products = await prisma.product.findMany({
      where: { active: true, stock: { not: null } },
      orderBy: { stock: "asc" },
    });
    const low = products.filter((p) => p.stock !== null && p.stock <= p.lowStockAt);
    return { products: low };
  });
}
