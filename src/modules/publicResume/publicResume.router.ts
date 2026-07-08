import { Router } from 'express';
import { validateRequest } from '../../middleware/validateRequest';
import * as controller from './publicResume.controller';
import { slugParamSchema, trackViewSchema } from './publicResume.schema';

const router = Router();

// Public routes — no auth required. We intentionally don't use checkAuth here
// because these endpoints are called by anonymous visitors.

router.get('/:slug', validateRequest(slugParamSchema), controller.getResumeBySlug);
router.post(
  '/:slug/track-view',
  validateRequest(slugParamSchema),
  validateRequest(trackViewSchema),
  controller.trackView
);
router.get('/:slug/pdf', validateRequest(slugParamSchema), controller.getPdfUrl);

export const publicResumeRouter = router;