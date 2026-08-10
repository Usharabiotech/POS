import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { loginSchema } from "@cafepos/shared";
import { prisma } from "../db.js";
import { signToken, requireAuth } from "../auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    // Forgive stray spaces and letter-case from touch keyboards / autofill.
    const username = parsed.data.username.trim();
    const password = parsed.data.password.trim();
    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });
    if (!user || !user.active) {
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "Invalid credentials" });

    const authUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    };
    return { token: signToken(authUser), user: authUser };
  });

  app.get("/me", { preHandler: requireAuth }, async (req) => {
    return { user: req.user };
  });
}
