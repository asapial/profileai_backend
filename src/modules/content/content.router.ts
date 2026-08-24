import { Router } from "express";
import * as contentController from "./content.controller";

const router = Router();

router.get("/homepage", contentController.homepage);
router.get("/pages/:slug", contentController.page);

export const contentRouter = router;
