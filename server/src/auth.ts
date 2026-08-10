import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";
import type { Role } from "@prisma/client";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, env.jwtSecret, { expiresIn: env.accessTokenTtl } as jwt.SignOptions);
}

/** Fastify preHandler: require a valid Bearer token; attaches req.user. */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Not authenticated" });
  }
  try {
    const payload = jwt.verify(header.slice(7), env.jwtSecret) as AuthUser;
    req.user = payload;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

/** preHandler factory: require one of the given roles (use after requireAuth). */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}
