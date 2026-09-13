import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import { validateRequest } from '../../middleware/validateRequest';
import * as controller from './job.controller';
import { listJobsSchema, createApplicationFromJobSchema, createJobSchema, jobIdSchema, updateJobSchema } from './job.schema';

const router = Router();
router.use(checkAuth());
router.get('/', validateRequest(listJobsSchema), controller.list);
router.post('/', validateRequest(createJobSchema), controller.create);
router.get('/:id', validateRequest(jobIdSchema), controller.get);
router.put('/:id', validateRequest(updateJobSchema), controller.update);
router.post('/:id/application', validateRequest(createApplicationFromJobSchema), controller.createApplication);
router.delete('/:id', validateRequest(jobIdSchema), controller.remove);
export const jobRouter = router;
