import { Router } from 'express';
import multer from 'multer';
import * as templateController from './template.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import {
  createTemplateSchema,
  forkUserTemplateSchema,
  updateTemplateSchema,
  updateUserTemplateSchema,
} from './template.schema';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Public Routes ────────────────────────────────────
router.get('/', templateController.listTemplates);

// Authenticated personal gallery routes must precede the dynamic public route.
router.get('/mine', checkAuth(), templateController.listMyTemplates);
router.post('/mine', checkAuth(), validateRequest(forkUserTemplateSchema), templateController.forkMyTemplate);
router.put('/mine/:id', checkAuth(), validateRequest(updateUserTemplateSchema), templateController.updateMyTemplate);
router.post('/mine/:id/submit', checkAuth(), templateController.submitMyTemplate);
router.delete('/mine/:id', checkAuth(), templateController.deleteMyTemplate);

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
