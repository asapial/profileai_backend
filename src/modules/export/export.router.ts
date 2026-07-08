import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import * as exportController from './export.controller';

const router = Router();

router.use(checkAuth());

// User data export
router.post('/user/export', exportController.requestUserExport);
router.get('/user/export-jobs', exportController.list);
router.get('/user/export-jobs/:id', exportController.get);

// Resume PDF export
router.post('/resumes/:id/export', exportController.requestResumeExport);

export const exportRouter = router;
