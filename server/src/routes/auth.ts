import type { FastifyInstance, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { loginSchema, changePasswordSchema } from "@cafepos/shared";
import { prisma } from "../db.js";
import { signToken, requireAuth } from "../auth.js";

// ── Brute-force guard ─────────────────────────────────────────────────────────
// In-memory sliding lockout keyed by IP+username. Enough for a single-till shop
// (one server process); no extra dependency, resets on restart. Blocks the
// password-guessing that a public repo + default creds would otherwise invite.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const attempts = new Map<string, { count: number; first: number }>();

function attemptKey(req: FastifyRequest, username: string) {
  return `${req.ip}::${username.toLowerCase()}`;
}
/** Returns seconds to wait if locked out, else 0. */
function lockedFor(key: string): number {
  const rec = attempts.get(key);
  if (!rec) return 0;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }
  if (rec.count >= MAX_ATTEMPTS) {
    return Math.ceil((rec.first + WINDOW_MS - Date.now()) / 1000);
  }
  return 0;
}
function recordFail(key: string) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count++;
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid input" });

    // Forgive stray spaces and letter-case from touch keyboards / autofill.
    const username = parsed.data.username.trim();
    const password = parsed.data.password.trim();

    const key = attemptKey(req, username);
    const wait = lockedFor(key);
    if (wait > 0) {
      const mins = Math.ceil(wait / 60);
      return reply
        .code(429)
        .send({ error: `Too many attempts. Try again in ${mins} minute${mins > 1 ? "s" : ""}.` });
    }

    const user = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });
    if (!user || !user.active) {
      recordFail(key);
      return reply.code(401).send({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      recordFail(key);
      return reply.code(401).send({ error: "Invalid credentials" });
    }

    attempts.delete(key); // successful login clears the counter
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

  // Change your own password (any signed-in user). Requires the current one.
  app.post("/change-password", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return reply.code(404).send({ error: "User not found" });

    const ok = await bcrypt.compare(parsed.data.currentPassword.trim(), user.passwordHash);
    if (!ok) return reply.code(401).send({ error: "Current password is incorrect" });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
    });
    return { ok: true };
  });
}
