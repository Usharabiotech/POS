import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

const admin = { preHandler: [requireAuth, requireRole("ADMIN")] };

export async function modifierRoutes(app: FastifyInstance) {
  // All groups with their options (for the Modifiers manager + product editor).
  app.get("/admin/modifier-groups", admin, async () => {
    const groups = await prisma.modifierGroup.findMany({
      orderBy: { sort: "asc" },
      include: { options: { orderBy: { sort: "asc" } } },
    });
    return { groups };
  });

  const groupSchema = z.object({
    name: z.string().min(1),
    selectType: z.enum(["SINGLE", "MULTI"]).default("SINGLE"),
    required: z.boolean().default(false),
    minSelect: z.number().int().min(0).default(0),
    maxSelect: z.number().int().positive().nullable().optional(),
    active: z.boolean().optional(),
  });

  app.post("/admin/modifier-groups", admin, async (req, reply) => {
    const parsed = groupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid group" });
    const count = await prisma.modifierGroup.count();
    const group = await prisma.modifierGroup.create({ data: { ...parsed.data, sort: count } });
    return { group };
  });

  app.patch("/admin/modifier-groups/:id", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = groupSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid group" });
    const group = await prisma.modifierGroup.update({ where: { id }, data: parsed.data });
    return { group };
  });

  app.delete("/admin/modifier-groups/:id", admin, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.modifierGroup.delete({ where: { id } }); // cascades options + product links
    return { ok: true };
  });

  const optionSchema = z.object({
    name: z.string().min(1),
    priceDelta: z.number().default(0),
  });

  app.post("/admin/modifier-groups/:id/options", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = optionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid option" });
    const count = await prisma.modifierOption.count({ where: { groupId: id } });
    const option = await prisma.modifierOption.create({
      data: { groupId: id, name: parsed.data.name, priceDelta: parsed.data.priceDelta, sort: count },
    });
    return { option };
  });

  app.patch("/admin/modifier-options/:id", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = optionSchema.extend({ active: z.boolean() }).partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid option" });
    const option = await prisma.modifierOption.update({ where: { id }, data: parsed.data });
    return { option };
  });

  app.delete("/admin/modifier-options/:id", admin, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.modifierOption.delete({ where: { id } });
    return { ok: true };
  });

  // Set which groups apply to a product (replaces the current set).
  app.put("/admin/products/:id/modifier-groups", admin, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z.object({ groupIds: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid groups" });
    await prisma.productModifier.deleteMany({ where: { productId: id } });
    await prisma.productModifier.createMany({
      data: parsed.data.groupIds.map((groupId, i) => ({ productId: id, groupId, sort: i })),
    });
    return { ok: true };
  });

  // Which groups a product currently has (for the product editor).
  app.get("/admin/products/:id/modifier-groups", admin, async (req) => {
    const { id } = req.params as { id: string };
    const links = await prisma.productModifier.findMany({
      where: { productId: id },
      orderBy: { sort: "asc" },
    });
    return { groupIds: links.map((l) => l.groupId) };
  });
}
