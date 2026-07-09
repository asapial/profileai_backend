import { Router } from 'express';
import { checkAuth } from '../../middleware/checkAuth';
import * as notificationController from './notification.controller';

const router = Router();

router.use(checkAuth());

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/read-all', notificationController.markAllRead);
router.patch('/:id/read', notificationController.markRead);
router.delete('/:id', notificationController.remove);

export const notificationRouter = router;
