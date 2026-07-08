import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { validateRequest } from '../../middleware/validateRequest';
import * as projectController from './project.controller';
import { createProjectSchema, updateProjectSchema } from './project.schema';

const router = Router();

router.use(checkAuth());

router.get('/', projectController.list);
router.get('/:id', projectController.get);
router.post('/', validateRequest(createProjectSchema), projectController.create);
router.put('/:id', validateRequest(updateProjectSchema), projectController.update);
router.delete('/:id', projectController.remove);

export const projectRouter = router;
