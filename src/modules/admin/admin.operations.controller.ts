import type { Request, Response } from "express";
import status from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { HomepageConfig } from "../content/content.defaults";
import * as ops from "./admin.operations.service";

const ok = (res: Response, data: unknown, message = "Request completed.") =>
  sendResponse(res, { status: status.OK, success: true, message, data });
const created = (res: Response, data: unknown, message = "Record created.") =>
  sendResponse(res, { status: status.CREATED, success: true, message, data });
const id = (req: Request) => String(req.params.id);
const query = (req: Request, key: string) =>
  typeof req.query[key] === "string" ? (req.query[key] as string) : undefined;

export const getHomepage = catchAsync(async (_req, res) =>
  ok(res, await ops.homepage.get(), "Homepage editor content retrieved."),
);
export const saveHomepage = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.homepage.save(req.body.draft as HomepageConfig, req.user.userId),
    "Homepage draft saved.",
  ),
);
export const publishHomepage = catchAsync(async (req, res) =>
  ok(res, await ops.homepage.publish(req.user.userId), "Homepage published."),
);

export const listFeatureFlags = catchAsync(async (_req, res) =>
  ok(res, await ops.featureFlags.list()),
);
export const createFeatureFlag = catchAsync(async (req, res) =>
  created(res, await ops.featureFlags.create(req.body)),
);
export const updateFeatureFlag = catchAsync(async (req, res) =>
  ok(res, await ops.featureFlags.update(id(req), req.body)),
);
export const deleteFeatureFlag = catchAsync(async (req, res) =>
  ok(res, await ops.featureFlags.remove(id(req))),
);

export const listAnnouncements = catchAsync(async (_req, res) =>
  ok(res, await ops.announcements.list()),
);
export const createAnnouncement = catchAsync(async (req, res) =>
  created(res, await ops.announcements.create(req.body)),
);
export const updateAnnouncement = catchAsync(async (req, res) =>
  ok(res, await ops.announcements.update(id(req), req.body)),
);
export const publishAnnouncement = catchAsync(async (req, res) =>
  ok(res, await ops.announcements.publish(id(req)), "Announcement published."),
);
export const retireAnnouncement = catchAsync(async (req, res) =>
  ok(res, await ops.announcements.retire(id(req)), "Announcement retired."),
);

export const listTickets = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.tickets.list({ status: query(req, "status"), q: query(req, "q") }),
  ),
);
export const getTicket = catchAsync(async (req, res) =>
  ok(res, await ops.tickets.detail(id(req))),
);
export const updateTicket = catchAsync(async (req, res) =>
  ok(res, await ops.tickets.update(id(req), req.body)),
);
export const replyTicket = catchAsync(async (req, res) =>
  created(
    res,
    await ops.tickets.reply(id(req), String(req.body.body ?? ""), {
      id: req.user.userId,
      email: req.user.email,
    }),
    "Reply added.",
  ),
);

export const listHelpArticles = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.helpArticles.list({
      status: query(req, "status"),
      category: query(req, "category"),
      q: query(req, "q"),
    }),
  ),
);
export const listHelpCategories = catchAsync(async (_req, res) =>
  ok(res, await ops.helpArticles.categories()),
);
export const getHelpArticle = catchAsync(async (req, res) =>
  ok(res, await ops.helpArticles.detail(id(req))),
);
export const createHelpArticle = catchAsync(async (req, res) =>
  created(res, await ops.helpArticles.create(req.body, req.user.email)),
);
export const updateHelpArticle = catchAsync(async (req, res) =>
  ok(res, await ops.helpArticles.update(id(req), req.body)),
);

export const listModeration = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.moderation.list({
      status: query(req, "status"),
      kind: query(req, "kind"),
      q: query(req, "q"),
    }),
  ),
);
export const resolveModeration = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.moderation.resolve(
      id(req),
      String(req.body.action),
      req.user.userId,
      req.body.note ? String(req.body.note) : undefined,
    ),
  ),
);

const auditFilters = (req: Request) => ({
  category: query(req, "category"),
  actorId: query(req, "actorId") ?? query(req, "actor"),
  action: query(req, "action"),
  from: query(req, "from"),
  to: query(req, "to"),
  search: query(req, "search"),
});
export const listAudit = catchAsync(async (req, res) =>
  ok(res, await ops.audit.list(auditFilters(req))),
);
export const getAudit = catchAsync(async (req, res) =>
  ok(res, await ops.audit.detail(id(req))),
);
export const exportAudit = catchAsync(async (req, res) =>
  ok(res, await ops.audit.exportUrl(auditFilters(req))),
);

export const getSecurity = catchAsync(async (_req, res) =>
  ok(res, await ops.security.summary()),
);

export const listPlans = catchAsync(async (_req, res) =>
  ok(res, await ops.plans.list()),
);
export const createPlan = catchAsync(async (req, res) =>
  created(res, await ops.plans.create(req.body)),
);
export const updatePlan = catchAsync(async (req, res) =>
  ok(res, await ops.plans.update(id(req), req.body)),
);
export const archivePlan = catchAsync(async (req, res) =>
  ok(res, await ops.plans.archive(id(req))),
);

export const listCoupons = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.coupons.list({
      status: query(req, "status"),
      search: query(req, "search"),
    }),
  ),
);
export const createCoupon = catchAsync(async (req, res) =>
  created(res, await ops.coupons.create(req.body)),
);
export const updateCoupon = catchAsync(async (req, res) =>
  ok(res, await ops.coupons.update(id(req), req.body)),
);
export const deactivateCoupon = catchAsync(async (req, res) =>
  ok(res, await ops.coupons.deactivate(id(req))),
);

const invoiceFilters = (req: Request) => ({
  status: query(req, "status"),
  search: query(req, "search"),
  from: query(req, "from"),
  to: query(req, "to"),
});
export const listInvoices = catchAsync(async (req, res) =>
  ok(res, await ops.invoices.list(invoiceFilters(req))),
);
export const refundInvoice = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.invoices.refund(
      id(req),
      req.body.amount === undefined ? undefined : Number(req.body.amount),
    ),
    "Refund recorded.",
  ),
);
export const exportInvoices = catchAsync(async (req, res) =>
  ok(res, await ops.invoices.exportUrl(invoiceFilters(req))),
);

export const getAdminProfile = catchAsync(async (req, res) =>
  ok(res, await ops.adminProfile.get(req.user.userId)),
);
export const updateAdminProfile = catchAsync(async (req, res) =>
  ok(res, await ops.adminProfile.update(req.user.userId, req.body)),
);
export const listAdminSessions = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.adminProfile.sessions(
      req.user.userId,
      req.cookies?.accessToken as string | undefined,
    ),
  ),
);
export const listAdminDevices = catchAsync(async (req, res) =>
  ok(res, await ops.adminProfile.devices(req.user.userId)),
);
export const changeAdminPassword = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.adminProfile.changePassword(
      req.user.userId,
      String(req.body.currentPassword ?? ""),
      String(req.body.newPassword ?? ""),
      req.cookies?.accessToken as string | undefined,
    ),
  ),
);
export const toggleAdminTwoFactor = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.adminProfile.toggleTwoFactor(
      req.user.userId,
      Boolean(req.body.enabled),
    ),
  ),
);
export const revokeAdminSession = catchAsync(async (req, res) =>
  ok(res, await ops.adminProfile.revokeSession(req.user.userId, id(req))),
);
export const revokeAllAdminSessions = catchAsync(async (req, res) =>
  ok(res, await ops.adminProfile.revokeAllSessions(req.user.userId)),
);
export const revokeAdminDevice = catchAsync(async (req, res) =>
  ok(res, await ops.adminProfile.revokeDevice(req.user.userId, id(req))),
);
export const trustAdminDevice = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.adminProfile.trustDevice(
      req.user.userId,
      id(req),
      Boolean(req.body.trusted),
    ),
  ),
);

export const listAdminTemplates = catchAsync(async (req, res) => {
  const category = query(req, "category");
  const documentType = query(req, "documentType");
  const reviewStatus = query(req, "reviewStatus");
  return ok(res, await ops.templates.list({
    ...(category !== undefined ? { category } : {}),
    ...(documentType !== undefined ? { documentType } : {}),
    ...(reviewStatus !== undefined ? { reviewStatus } : {}),
  }));
});
export const getAdminTemplate = catchAsync(async (req, res) =>
  ok(res, await ops.templates.detail(id(req))),
);
export const getAdminTemplateHistory = catchAsync(async (req, res) =>
  ok(res, await ops.templates.history(id(req))),
);
export const createAdminTemplate = catchAsync(async (req, res) =>
  created(res, await ops.templates.create(req.body, req.user.userId)),
);
export const updateAdminTemplate = catchAsync(async (req, res) =>
  ok(
    res,
    await ops.templates.update(id(req), req.body, {
      id: req.user.userId,
      email: req.user.email,
    }),
  ),
);
export const setAdminTemplateStatus = catchAsync(async (req, res) =>
  ok(res, await ops.templates.status(id(req), Boolean(req.body.isActive))),
);
export const setAdminTemplateDefault = catchAsync(async (req, res) =>
  ok(res, await ops.templates.setDefault(id(req))),
);
export const deleteAdminTemplate = catchAsync(async (req, res) =>
  ok(res, await ops.templates.remove(id(req))),
);
export const reviewAdminTemplate = catchAsync(async (req, res) =>
  ok(res, await ops.templates.review(id(req), req.user.userId, req.body)),
);

export const listResumes = catchAsync(async (_req, res) =>
  ok(res, await ops.operational.resumes()),
);
export const listExports = catchAsync(async (_req, res) =>
  ok(res, await ops.operational.exports()),
);
export const getReports = catchAsync(async (_req, res) =>
  ok(res, await ops.operational.reports()),
);

export const getSectionSetting = catchAsync(async (req, res) =>
  ok(res, await ops.sectionSettings.get(String(req.params.key))),
);
export const putSectionSetting = catchAsync(async (req, res) =>
  ok(res, await ops.sectionSettings.put(String(req.params.key), req.body)),
);
export const testEmail = catchAsync(async (_req, res) =>
  ok(res, ops.sectionSettings.testEmail()),
);
