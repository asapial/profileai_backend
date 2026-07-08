import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../utils/catchAsync';
import { sendResponse } from '../../utils/sendResponse';
import { prisma } from '../../lib/prisma';

const ALLOWED_NAMES = new Set([
  'cta_click',
  'template_preview',
  'pricing_view',
  'register_start',
  'register_complete',
  'faq_open',
]);

const MAX_PATH_LENGTH = 500;
const MAX_LABEL_LENGTH = 200;

const sanitizeString = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

export const recordEvents = catchAsync(async (req: Request, res: Response) => {
  const body = req.body as { events?: unknown };
  const rawEvents = Array.isArray(body?.events) ? body.events : null;
  if (!rawEvents) {
    sendResponse(res, {
      status: status.BAD_REQUEST,
      success: false,
      message: 'Invalid payload: expected { events: [...] }.',
      data: null,
    });
    return;
  }

  // Cap batch size to keep DoS surface small.
  const events = rawEvents.slice(0, 50);

  const valid = events.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || !ALLOWED_NAMES.has(candidate.name)) return [];
    const path = sanitizeString(candidate.path, MAX_PATH_LENGTH);
    if (!path) return [];
    const label = sanitizeString(candidate.label, MAX_LABEL_LENGTH);
    const destination = sanitizeString(candidate.destination, MAX_LABEL_LENGTH);
    const sessionId = sanitizeString(candidate.sessionId, 80) ?? 'unknown';
    return [{
      name: candidate.name,
      path,
      label,
      destination,
      sessionId,
    }];
  });

  if (valid.length > 0) {
    try {
      await prisma.analyticsEvent.createMany({ data: valid, skipDuplicates: true });
    } catch {
      // Swallow persistence errors — analytics must never fail the request
      // visible to the visitor. Just acknowledge what was received.
    }
  }

  sendResponse(res, {
    status: status.OK,
    success: true,
    message: 'Events recorded.',
    data: { accepted: valid.length, rejected: events.length - valid.length },
  });
});