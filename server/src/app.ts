import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { authRouter } from "./routes/auth.routes";
import { workspacesRouter } from "./routes/workspaces.routes";
import { documentsRouter } from "./routes/documents.routes";
import { commentsRouter } from "./routes/comments.routes";
import { notificationsRouter } from "./routes/notifications.routes";
import { searchRouter } from "./routes/search.routes";
import { errorHandler, notFoundHandler } from "./middleware/error";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Basic rate limiting — auth endpoints get a tighter budget.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "syncroom-server", time: new Date().toISOString() });
  });

  app.use("/api/auth", authLimiter, authRouter);
  app.use("/api/workspaces", apiLimiter, workspacesRouter);
  app.use("/api/documents", apiLimiter, documentsRouter);
  app.use("/api", apiLimiter, commentsRouter);
  app.use("/api/notifications", apiLimiter, notificationsRouter);
  app.use("/api/search", apiLimiter, searchRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
