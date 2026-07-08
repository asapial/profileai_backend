import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { validateRequest } from '../../middleware/validateRequest';
import * as referenceController from './reference.controller';
import { createReferenceSchema, updateReferenceSchema } from './reference.schema';

const router = Router();

router.use(checkAuth());

router.get('/', referenceController.list);
router.get('/:id', referenceController.get);
router.post('/', validateRequest(createReferenceSchema), referenceController.create);
router.put('/:id', validateRequest(updateReferenceSchema), referenceController.update);
router.delete('/:id', referenceController.remove);

export const referenceRouter = router;
