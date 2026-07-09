// ─── Stripe webhook ingress (U-P14) ────────────────────────────────────────
// Mounted in app.ts *before* express.json() so Stripe's signature
// verification can read the raw byte stream. Idempotency lives in the
// service; this router only forwards the raw body + signature header.
// ─────────────────────────────────────────────────────────────────────────
import { Router, raw } from 'express';
import { handleStripeWebhook } from './billing.service';

const router = Router();

router.post(
  '/stripe',
  raw({ type: 'application/json', limit: '1mb' }),
  async (req, res, next) => {
    try {
      const sig = (req.headers['stripe-signature'] as string | undefined) ?? undefined;
      const result = await handleStripeWebhook(
        Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body ?? ''),
        sig
      );
      res.json({ ...result, received: true });
    } catch (err) {
      next(err);
    }
  }
);

export const stripeWebhookRouter = router;
