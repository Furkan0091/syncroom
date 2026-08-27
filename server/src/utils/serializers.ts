import type { User } from "@prisma/client";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

export function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}
