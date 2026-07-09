import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { validateRequest } from '../../middleware/validateRequest';
import * as toolsController from './tools.controller';
import { analyzeJdSchema } from './tools.schema';

const router = Router();

router.use(checkAuth());

router.post('/analyze-jd', validateRequest(analyzeJdSchema), toolsController.analyzeJd);

export const toolsRouter = router;
