import { Router } from 'express';
import { envVars } from '../../config/env';
import { completeBkashCallback } from './bkash.service';

const router = Router();

router.get('/callback', async (req, res, next) => {
  try {
    const paymentID = typeof req.query.paymentID === 'string' ? req.query.paymentID : '';
    const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : '';
    if (!paymentID) return res.redirect(302, '/');
    const result = await completeBkashCallback(paymentID, status);
    return res.redirect(302, result.redirect);
  } catch (error) {
    if (res.headersSent) return next(error);
    return res.redirect(302, `${envVars.FRONTEND_URL.replace(/\/+$/, '')}/dashboard/billing?payment=failure`);
  }
});

export const bkashPublicRouter = router;
