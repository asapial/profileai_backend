import { Router } from 'express';
import * as resumeController from './resume.controller';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import {
  generateResumeSchema,
  updateResumeSchema,
  atsCheckSchema,
  aiModifySchema,
  exportResumeSchema,
} from './resume.schema';

const router = Router();

// All resume routes require authentication
router.use(checkAuth());

router.get('/', resumeController.listResumes);
router.post('/generate', validateRequest(generateResumeSchema), resumeController.generateResume);
router.get('/:id', resumeController.getResume);
router.put('/:id', validateRequest(updateResumeSchema), resumeController.updateResume);
router.delete('/:id', resumeController.deleteResume);
router.post('/:id/ats-check', validateRequest(atsCheckSchema), resumeController.atsCheck);
router.post('/:id/export', validateRequest(exportResumeSchema), resumeController.exportPdf);
router.get('/:id/history', resumeController.getHistory);
router.post('/:id/restore/:version', resumeController.restoreVersion);
router.post('/:id/duplicate', resumeController.duplicateResume);
router.put('/:id/ai-modify', validateRequest(aiModifySchema), resumeController.aiModifySection);

export const resumeRouter = router;
