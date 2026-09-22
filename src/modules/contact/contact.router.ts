import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { validateRequest } from "../../middleware/validateRequest";
import { submit } from "./contact.controller";
import { contactRequestSchema } from "./contact.schema";

const router = Router();
const contactLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/", contactLimit, validateRequest(contactRequestSchema), submit);

export const contactRouter = router;
