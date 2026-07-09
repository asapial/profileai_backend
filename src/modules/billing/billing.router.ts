// ─── Billing routes (U-P14) ────────────────────────────────────────────────
// All routes sit behind checkAuth(); the Stripe webhook lives in its
// own router mounted before express.json() in app.ts, so it can read
// the raw body for signature verification.
// ─────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import z from 'zod';
import { checkAuth } from '../../middleware/checkAuth';
import { billingController } from './billing.controller';
import { validateRequest } from '../../middleware/validateRequest';

const router = Router();

const checkoutSchema = z.object({
  planSlug: z.string().min(1),
  couponCode: z.string().optional(),
});

const couponSchema = z.object({
  code: z.string().min(1),
  planSlug: z.string().min(1),
});

router.use(checkAuth());

router.get('/plans', billingController.plans);
router.get('/subscription', billingController.current);
router.post('/checkout', validateRequest(checkoutSchema), billingController.checkout);
router.post('/portal', billingController.portal);
router.post('/cancel', billingController.cancel);
router.get('/invoices', billingController.invoices);
router.post('/coupons/preview', validateRequest(couponSchema), billingController.couponPreview);

export const billingRouter = router;
