import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import * as exportController from './export.controller';

const router = Router();

// User data export
router.post('/user/export', checkAuth(), exportController.requestUserExport);
router.get('/user/export-jobs', checkAuth(), exportController.list);
router.get('/user/export-jobs/:id', checkAuth(), exportController.get);

// Resume PDF export
router.post(
  '/resumes/:id/export',
  checkAuth(),
  exportController.requestResumeExport,
);

export const exportRouter = router;
