import { z } from 'zod';

// ─── Slug Param ────────────────────────────────────────
export const slugParamSchema = z.object({
  params: z.object({
    slug: z
      .string()
      .min(3, 'Slug too short.')
      .max(120, 'Slug too long.')
      .regex(/^[a-z0-9-]+$/i, 'Slug must be alphanumeric (with dashes).'),
  }),
});

// ─── Track View Body ───────────────────────────────────
// We don't require a body — analytics come from headers — but allow an
// optional eventType override so the same endpoint could later be reused
// for "download" beacons if we move away from the /pdf side-effect.
export const trackViewSchema = z.object({
  body: z
    .object({
      eventType: z.enum(['view', 'download']).optional(),
    })
    .optional(),
});

export type TrackViewBody = NonNullable<z.infer<typeof trackViewSchema>['body']>;