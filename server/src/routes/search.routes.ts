import { Router } from "express";
import { search } from "../services/search.service";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/errors";
import { searchQuerySchema, validate } from "../validation/schemas";

export const searchRouter = Router();

searchRouter.use(requireAuth);

// GET /api/search?q=...
searchRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { q } = validate(searchQuerySchema, { q: req.query.q });
    const results = await search(req.user!.id, q);
    res.json(results);
  }),
);
