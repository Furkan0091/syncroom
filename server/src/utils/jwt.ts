import jwt from "jsonwebtoken";
import { config } from "../config";

export interface JwtPayload {
  /** User id */
  sub: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === "string") return null;
    return { sub: decoded.sub as string };
  } catch {
    return null;
  }
}
