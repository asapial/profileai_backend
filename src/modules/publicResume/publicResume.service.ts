import status from 'http-status';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { getPresignedUrl } from '../../lib/minio';
import AppError from '../../errorHelpers/AppError';

// ─── Bot Detection ─────────────────────────────────────
// Cheap UA-pattern bot detection. Not exhaustive, but good enough for the
// first pass — combined with viewerHash-based dedupe in the controller it
// prevents the most common inflators from skewing analytics.
const BOT_REGEX =
  /(bot|crawler|spider|crawling|preview|facebookexternalhit|slack|lighthouse|pagespeed|gtmetrix|pingdom|curl|wget|python-requests|headless|phantom|selenium|puppeteer)/i;

export const isLikelyBot = (userAgent: string | undefined): boolean => {
  if (!userAgent) return true; // No UA → treat as bot to be safe.
  return BOT_REGEX.test(userAgent);
};

// ─── Viewer Hash ───────────────────────────────────────
// Daily-rotating SHA-256 of ip + ua + day bucket. Lets us dedupe views from
// the same browser without storing PII beyond ~24h of reversibility.
export const buildViewerHash = (
  ip: string | undefined,
  userAgent: string | undefined,
  date: Date = new Date()
): string => {
  const day = date.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const raw = `${ip ?? ''}|${userAgent ?? ''}|${day}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
};

// ─── Get Public Resume ─────────────────────────────────
// Returns only fields that are safe to expose to the public: title, content,
// template html/css, atsScore, and view count. Crucially NEVER returns
// userId, aiSuggestions, jobDescription, or pdfUrl directly — pdfUrl is
// fetched via the dedicated /pdf endpoint.
export const getPublicResume = async (slug: string) => {
  const resume = await prisma.resume.findUnique({
    where: { slug },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          htmlLayout: true,
          cssStyles: true,
        },
      },
      _count: {
        select: { views: true },
      },
    },
  });

  if (!resume || !resume.isPublic || resume.disabledByAdmin) {
    throw new AppError(status.NOT_FOUND, 'Resume not found.');
  }

  return {
    slug: resume.slug,
    title: resume.title,
    contentData: resume.contentData,
    atsScore: resume.atsScore,
    noindex: resume.noindex,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
    template: resume.template,
    viewCount: resume._count.views,
    hasPdf: Boolean(resume.pdfUrl),
  };
};

// ─── Record View Event ────────────────────────────────
// Used for both /track-view (POST) and as a side-effect of /pdf (download).
// Caller supplies the request metadata; we just persist + return eventType.
export const recordViewEvent = async (
  resumeId: string,
  eventType: 'view' | 'download',
  meta: {
    viewerHash: string | null;
    referrer: string | null;
    userAgent: string | null;
    ipAddress: string | null;
    isBot: boolean;
  }
) => {
  return prisma.resumeView.create({
    data: {
      resumeId,
      eventType,
      viewerHash: meta.viewerHash,
      referrer: meta.referrer,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      isBot: meta.isBot,
    },
    select: { id: true, createdAt: true },
  });
};

// ─── Get Public Pdf Url ───────────────────────────────
// Returns a short-lived presigned URL to the resume PDF in MinIO. Records a
// `download` event so the analytics dashboard picks it up.
export const getPublicPdfUrl = async (
  slug: string,
  meta: {
    viewerHash: string | null;
    referrer: string | null;
    userAgent: string | null;
    ipAddress: string | null;
    isBot: boolean;
  }
) => {
  const resume = await prisma.resume.findUnique({
    where: { slug },
    select: { id: true, pdfUrl: true, isPublic: true, disabledByAdmin: true },
  });

  if (!resume || !resume.isPublic || resume.disabledByAdmin) {
    throw new AppError(status.NOT_FOUND, 'Resume not found.');
  }

  if (!resume.pdfUrl) {
    throw new AppError(status.NOT_FOUND, 'No PDF available for this resume yet.');
  }

  // pdfUrl stores the MinIO object name (e.g. "resumes/<userId>/<id>/resume.pdf")
  const presignedUrl = await getPresignedUrl(resume.pdfUrl, 600); // 10 minutes

  // Record download event (fire-and-forget style; never blocks the download).
  await recordViewEvent(resume.id, 'download', meta);

  return { presignedUrl, expiresIn: 600 };
};