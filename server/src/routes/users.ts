import type { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { strongPasswordSchema } from "@cafepos/shared";
import { prisma } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/admin/users", { preHandler: [requireAuth, requireRole("ADMIN")] }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
    });
    return { users };
  });

  app.post("/admin/users", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req, reply) => {
    const parsed = z
      .object({
        username: z.string().min(3),
        name: z.string().min(1),
        password: strongPasswordSchema,
        role: z.enum(["ADMIN", "CASHIER"]).default("CASHIER"),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (exists) return reply.code(409).send({ error: "Username already taken" });

    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
      },
      select: { id: true, username: true, name: true, role: true, active: true },
    });
    return { user };
  });

  // Toggle active / deactivate, or reset a staff member's password (admin only).
  app.patch("/admin/users/:id", { preHandler: [requireAuth, requireRole("ADMIN")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ active: z.boolean().optional(), password: strongPasswordSchema.optional() })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    if (parsed.data.active === undefined && parsed.data.password === undefined) {
      return reply.code(400).send({ error: "Nothing to update" });
    }

    if (parsed.data.active === false) {
      const target = await prisma.user.findUnique({ where: { id } });
      if (target?.role === "ADMIN") {
        const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
        if (activeAdmins <= 1) {
          return reply.code(400).send({ error: "Cannot disable the last active admin" });
        }
      }
    }

    const data: { active?: boolean; passwordHash?: string } = {};
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.password !== undefined) {
      data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, username: true, name: true, role: true, active: true },
    });
    return { user };
  });
}
