import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma";
import { verifyToken } from "../utils/jwt";
import { UnauthorizedError } from "../utils/errors";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verifies the `Authorization: Bearer <token>` header and attaches the user. */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedError("Authentication required");
    }

    const payload = verifyToken(token);
    if (!payload) {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }

    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}
