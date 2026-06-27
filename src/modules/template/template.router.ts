import { Router } from 'express';
import multer from 'multer';
import * as templateController from './template.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import { createTemplateSchema, updateTemplateSchema } from './template.schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Public Routes ────────────────────────────────────
router.get('/', templateController.listTemplates);
router.get('/:id', templateController.getTemplate);

// ─── Admin-Only Routes ────────────────────────────────
router.post(
  '/',
  checkAuth('ADMIN'),
  upload.single('thumbnail'),
  validateRequest(createTemplateSchema),
  templateController.createTemplate
);

router.put(
  '/:id',
  checkAuth('ADMIN'),
  upload.single('thumbnail'),
  validateRequest(updateTemplateSchema),
  templateController.updateTemplate
);

router.patch('/:id/status', checkAuth('ADMIN'), templateController.toggleStatus);
router.patch('/:id/default', checkAuth('ADMIN'), templateController.setDefault);
router.delete('/:id', checkAuth('ADMIN'), templateController.deleteTemplate);

export const templateRouter = router;
