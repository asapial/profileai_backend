import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { validateRequest } from '../../middleware/validateRequest';
import * as applicationController from './application.controller';
import {
  createApplicationSchema,
  updateApplicationSchema,
} from './application.schema';

const router = Router();

router.use(checkAuth());

router.get('/', applicationController.list);
router.get('/:id', applicationController.get);
router.post('/', validateRequest(createApplicationSchema), applicationController.create);
router.put('/:id', validateRequest(updateApplicationSchema), applicationController.update);
router.delete('/:id', applicationController.remove);

export const applicationRouter = router;
