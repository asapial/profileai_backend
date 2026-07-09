import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { validateRequest } from '../../middleware/validateRequest';
import * as coverLetterController from './coverLetter.controller';
import {
  createCoverLetterSchema,
  idParamSchema,
  listCoverLettersSchema,
  regenerateCoverLetterSchema,
  updateCoverLetterSchema,
} from './coverLetter.schema';

const router = Router();

router.use(checkAuth());

router.get(
  '/',
  validateRequest(listCoverLettersSchema),
  coverLetterController.list,
);
router.get(
  '/:id',
  validateRequest(idParamSchema),
  coverLetterController.get,
);
router.post(
  '/',
  validateRequest(createCoverLetterSchema),
  coverLetterController.create,
);
router.put(
  '/:id',
  validateRequest(updateCoverLetterSchema),
  coverLetterController.update,
);
router.delete(
  '/:id',
  validateRequest(idParamSchema),
  coverLetterController.remove,
);
router.post(
  '/:id/regenerate',
  validateRequest(regenerateCoverLetterSchema),
  coverLetterController.regenerate,
);
router.post(
  '/:id/export',
  validateRequest(idParamSchema),
  coverLetterController.exportPdf,
);

export const coverLetterRouter = router;