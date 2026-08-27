import { Router } from "express";
import * as authService from "../services/auth.service";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import { loginSchema, registerSchema, validate } from "../validation/schemas";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = validate(registerSchema, req.body);
    const result = await authService.register(input);
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = validate(loginSchema, req.body);
    const result = await authService.login(input);
    res.json(result);
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.me(req.user!);
    res.json({ user });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  (_req, res) => {
    // JWTs are stateless — the client discards its token. This endpoint exists
    // for API symmetry and to let the client confirm the session ended.
    res.json({ ok: true });
  },
);
