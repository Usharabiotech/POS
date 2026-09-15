import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export async function storeRoutes(app: FastifyInstance) {
  // All branches (for the reports store selector + future branch switcher).
  app.get("/stores", { preHandler: requireAuth }, async () => {
    const stores = await prisma.store.findMany({ orderBy: { createdAt: "asc" } });
    return { stores };
  });

  app.post("/admin/stores", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req, reply) => {
    const parsed = z
      .object({
        name: z.string().min(1),
        code: z.string().optional(),
        address: z.string().optional(),
        gst: z.string().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid store" });
    const store = await prisma.store.create({ data: parsed.data });
    return { store };
  });

  app.patch("/admin/stores/:id", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        name: z.string().min(1).optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        gst: z.string().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid store" });
    const store = await prisma.store.update({ where: { id }, data: parsed.data });
    return { store };
  });
}
