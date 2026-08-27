import { prisma } from "../prisma";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { publicUser } from "../utils/serializers";
import { ConflictError, UnauthorizedError } from "../utils/errors";
import type { AuthUser } from "../middleware/auth";

export interface AuthResult {
  user: ReturnType<typeof publicUser>;
  token: string;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    },
  });

  return { user: publicUser(user), token: signToken(user.id) };
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  return { user: publicUser(user), token: signToken(user.id) };
}

export async function me(user: AuthUser): Promise<ReturnType<typeof publicUser>> {
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) throw new UnauthorizedError("User no longer exists");
  return publicUser(dbUser);
}
