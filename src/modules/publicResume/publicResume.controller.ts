import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { redis } from '../../lib/redis';
import * as publicResumeService from './publicResume.service';

// ─── Helpers ───────────────────────────────────────────

const extractRequestMeta = (req: Request) => {
  const userAgent = req.get('user-agent') ?? null;
  const referrer = req.get('referer') ?? req.get('referrer') ?? null;
  // Express's `req.ip` honors `trust proxy`. Falls back to socket remote addr.
  const ipAddress = req.ip || req.socket.remoteAddress || null;
  const isBot = publicResumeService.isLikelyBot(userAgent ?? undefined);
  const viewerHash = isBot
    ? null
    : publicResumeService.buildViewerHash(ipAddress ?? undefined, userAgent ?? undefined);
  return { userAgent, referrer, ipAddress, isBot, viewerHash };
};

// Per-viewer rate limit using Redis. Caps tracking at 1 event / 5s / hash so
// a determined client can't blow up the ResumeView table.
const enforceTrackRateLimit = async (viewerHash: string | null): Promise<boolean> => {
  if (!viewerHash) return true; // Bots bypass — they don't store a hash anyway.
  const key = `rv:track:${viewerHash}`;
  const set = await redis.set(key, '1', 'EX', 5, 'NX');
  return set === 'OK';
};

// ─── GET /public/resumes/:slug ─────────────────────────

export const getResumeBySlug = catchAsync(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const data = await publicResumeService.getPublicResume(slug);

  // Respect noindex via X-Robots-Tag header so crawlers honor the flag
  // even when proxy/CDN caching strips <meta>.
  if (data.noindex) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  } else {
    res.setHeader('X-Robots-Tag', 'index, follow');
  }

  // Cache public resumes briefly at the CDN edge.
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Resume retrieved.',
    data,
  });
});

// ─── POST /public/resumes/:slug/track-view ─────────────
// Called client-side after the resume page mounts. Records a `view` event.
// Skips silently for bots — no error, just no insert.

export const trackView = catchAsync(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const meta = extractRequestMeta(req);

  // Resolve slug → resumeId once for the rate-limit + insert.
  const resume = await prisma.resume.findUnique({
    where: { slug },
    select: { id: true, isPublic: true, disabledByAdmin: true },
  });

  if (!resume || !resume.isPublic || resume.disabledByAdmin) {
    // Treat as 404 to avoid leaking slug existence to scanners.
    sendResponse(res, {
      status: status.NOT_FOUND,
      success: false,
      message: 'Resume not found.',
      data: null,
    });
    return;
  }

  const allowed = await enforceTrackRateLimit(meta.viewerHash);
  if (!allowed) {
    sendResponse(res, {
      status: status.TOO_MANY_REQUESTS,
      success: false,
      message: 'Slow down — too many tracking requests.',
      data: null,
    });
    return;
  }

  if (!meta.isBot) {
    await publicResumeService.recordViewEvent(resume.id, 'view', meta);
  }

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'View recorded.',
    data: { recorded: !meta.isBot },
  });
});

// ─── GET /public/resumes/:slug/pdf ─────────────────────
// Returns a presigned MinIO URL the client can open in a new tab. Also
// records a `download` event.

export const getPdfUrl = catchAsync(async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const meta = extractRequestMeta(req);

  const result = await publicResumeService.getPublicPdfUrl(slug, meta);

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'PDF URL generated.',
    data: result,
  });
});

// Prisma import is needed for the slug lookup above — re-import lazily.
import { prisma } from '../../lib/prisma';