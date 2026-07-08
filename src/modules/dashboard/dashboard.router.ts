import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import * as dashboardController from './dashboard.controller';

const router = Router();

// All dashboard routes require authentication.
router.use(checkAuth());

router.get('/summary', dashboardController.getSummary);

export const dashboardRouter = router;
