import status from "http-status";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { canReadAdminResource, selectTools } from "./aiChat.permissions";
import type { PageContext, ResourceType } from "./aiChat.schemas";
import type { AiChatActor, HelpContext, ResolvedChatContext, SafeResourceContext } from "./aiChat.types";

const ROUTE_PURPOSES: Array<[RegExp, string]> = [
  [/^\/$/, "Public product overview"],
  [/^\/pricing(?:\/|$)/, "Public plans and pricing"],
  [/^\/help(?:\/|$)/, "Published help center"],
  [/^\/(?:login|register|forgot-password|reset-password|verify-email)(?:\/|$)/, "Account access and recovery"],
  [/^\/templates(?:\/|$)/, "Public resume templates"],
  [/^\/dashboard(?:\/|$)/, "Authenticated career workspace"],
  [/^\/admin(?:\/|$)/, "Administrative workspace"],
  [/^\/resume(?:\/|$)/, "Legacy resume workspace"],
];

const RESOURCE_ROUTE: Record<ResourceType, RegExp | null> = {
  none: null,
  resume: /resume|resumes|ats/,
  cover_letter: /cover-letters/,
  application: /applications/,
  invoice: /billing|invoices/,
  support_ticket: /support|tickets/,
  user: /admin\/users/,
  template: /templates/,
  report: /admin\/(?:reports|analytics|audit-log|security)/,
};

export const resolveRoutePurpose = (route: string): string | null =>
  ROUTE_PURPOSES.find(([pattern]) => pattern.test(route))?.[1] ?? null;

export const validatePageCapability = (
  actor: AiChatActor,
  page: PageContext,
): string => {
  if (!page.route.startsWith("/") || page.route.startsWith("//") || page.route.includes("..") || /[\u0000-\u001F]/.test(page.route)) {
    throw new AppError(status.BAD_REQUEST, "The page context is invalid.", "INVALID_PAGE_CONTEXT");
  }
  const routePurpose = resolveRoutePurpose(page.route);
  if (!routePurpose) throw new AppError(status.BAD_REQUEST, "This page is not supported by chat.", "INVALID_PAGE_CONTEXT");
  if (actor.role === "VISITOR" && (/^\/dashboard/.test(page.route) || /^\/admin/.test(page.route))) {
    throw new AppError(status.FORBIDDEN, "Sign in to get help with this page.", "AUTHENTICATION_REQUIRED");
  }
  if (actor.role === "USER" && /^\/admin/.test(page.route)) {
    throw new AppError(status.FORBIDDEN, "This page requires administrator access.", "ROLE_NOT_ALLOWED");
  }
  if (page.resourceType === "none" && page.resourceId) {
    throw new AppError(status.BAD_REQUEST, "A resource ID requires a resource type.", "INVALID_PAGE_CONTEXT");
  }
  const expected = RESOURCE_ROUTE[page.resourceType];
  if (expected && !expected.test(page.route)) {
    throw new AppError(status.BAD_REQUEST, "The resource does not match the current page.", "INVALID_PAGE_CONTEXT");
  }
  return routePurpose;
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const BUILT_IN_PUBLIC_HELP: HelpContext[] = [
  { id: "builtin-ats", slug: "ats-score-explained", title: "Understanding your ATS score", excerpt: "ATS scoring estimates keyword match, section completeness, formatting safety and evidence of impact.", body: "An ATS score is guidance, not a hiring guarantee. Compare a truthful resume with the target job description, add relevant skills you actually have, keep conventional headings, and review every suggestion before applying it." },
  { id: "builtin-resume", slug: "create-your-first-resume", title: "Create your first resume", excerpt: "Complete your profile, choose a template, add target-job context and review the generated draft.", body: "Start in the resume workspace, use accurate profile facts, select an appropriate template, and keep all generated wording editable. Never add unsupported employment, education, skills or metrics." },
  { id: "builtin-plans", slug: "compare-plans", title: "Compare ProFile AI plans", excerpt: "Use the live plan list and usage limits supplied by ProFile AI.", body: "Choose based on current resume and AI limits plus the features shown on the pricing page. Billing status and payments are confirmed only by backend account data." },
  { id: "builtin-export", slug: "export-pdf-vs-docx", title: "Resume export help", excerpt: "Use the in-app export controls and keep a recoverable editable source.", body: "PDF preserves layout for most applications. If an export fails, save the resume, retry once, then contact support with the route and error code without sharing passwords or payment details." },
  { id: "builtin-security", slug: "enable-two-factor-auth", title: "Account security and access", excerpt: "Use verification, password recovery and two-factor authentication from official account pages.", body: "ProFile AI support never needs your password, OTP, recovery code or session token. Use the login recovery flow for access problems and the security support channel for suspicious activity." },
];

const assertOwned = async (
  table: "resume" | "coverLetter" | "jobApplication" | "invoice",
  id: string,
  userId: string,
): Promise<void> => {
  const row = table === "resume"
    ? await prisma.resume.findUnique({ where: { id }, select: { userId: true } })
    : table === "coverLetter"
      ? await prisma.coverLetter.findUnique({ where: { id }, select: { userId: true } })
      : table === "jobApplication"
        ? await prisma.jobApplication.findUnique({ where: { id }, select: { userId: true } })
        : await prisma.invoice.findUnique({ where: { id }, select: { userId: true } });
  if (!row) throw new AppError(status.NOT_FOUND, "The requested resource was not found.", "RESOURCE_NOT_FOUND");
  if (row.userId !== userId) throw new AppError(status.FORBIDDEN, "You do not own this resource.", "RESOURCE_NOT_OWNED");
};

const resolveUserResource = async (
  actor: AiChatActor,
  page: PageContext,
): Promise<SafeResourceContext | undefined> => {
  if (!page.resourceId || page.resourceType === "none") return undefined;
  const userId = actor.userId;
  if (!userId) throw new AppError(status.UNAUTHORIZED, "Sign in to access this resource.", "AUTHENTICATION_REQUIRED");
  switch (page.resourceType) {
    case "resume": {
      await assertOwned("resume", page.resourceId, userId);
      const row = await prisma.resume.findUnique({ where: { id: page.resourceId }, select: { title: true, status: true, targetJobTitle: true, atsScore: true, contentData: true, aiSuggestions: true, updatedAt: true } });
      return { type: "resume", title: row!.title, data: { status: row!.status, targetJobTitle: row!.targetJobTitle, atsScore: row!.atsScore, selectedSection: page.selectedSection, content: row!.contentData, priorSuggestions: row!.aiSuggestions, updatedAt: row!.updatedAt } };
    }
    case "cover_letter": {
      await assertOwned("coverLetter", page.resourceId, userId);
      const row = await prisma.coverLetter.findUnique({ where: { id: page.resourceId }, select: { title: true, targetJobTitle: true, targetCompany: true, status: true, contentText: true, contentJson: true, updatedAt: true } });
      return { type: "cover_letter", title: row!.title, data: { targetJobTitle: row!.targetJobTitle, targetCompany: row!.targetCompany, status: row!.status, content: row!.contentText ?? row!.contentJson, updatedAt: row!.updatedAt } };
    }
    case "application": {
      await assertOwned("jobApplication", page.resourceId, userId);
      const row = await prisma.jobApplication.findUnique({ where: { id: page.resourceId }, select: { company: true, role: true, status: true, location: true, appliedAt: true, reminderAt: true, notes: true, events: { orderBy: { createdAt: "asc" }, take: 20, select: { type: true, payload: true, createdAt: true } } } });
      return { type: "application", title: `${row!.role} at ${row!.company}`, data: row! };
    }
    case "invoice": {
      await assertOwned("invoice", page.resourceId, userId);
      const row = await prisma.invoice.findUnique({ where: { id: page.resourceId }, select: { amountPaid: true, amountDue: true, currency: true, status: true, issuedAt: true, paidAt: true } });
      return { type: "invoice", title: `Invoice from ${row!.issuedAt.toISOString().slice(0, 10)}`, data: row! };
    }
    case "support_ticket": {
      const row = await prisma.adminResource.findFirst({ where: { id: page.resourceId, type: "TICKET" } });
      if (!row) throw new AppError(status.NOT_FOUND, "Support ticket not found.", "RESOURCE_NOT_FOUND");
      const data = record(row.data);
      const owner = record(data.user);
      if (owner.id !== userId) throw new AppError(status.FORBIDDEN, "You do not own this support ticket.", "RESOURCE_NOT_OWNED");
      return { type: "support_ticket", title: String(data.subject ?? "Support ticket"), data: { status: data.status, priority: data.priority, category: data.category, preview: data.preview, messages: data.messages } };
    }
    case "template": {
      const row = await prisma.resumeTemplate.findFirst({ where: { id: page.resourceId, OR: [{ reviewStatus: "APPROVED", isActive: true }, { ownerId: userId }] }, select: { name: true, description: true, category: true, documentType: true, reviewStatus: true } });
      if (!row) throw new AppError(status.NOT_FOUND, "Template not found.", "RESOURCE_NOT_FOUND");
      return { type: "template", title: row.name, data: row };
    }
    default:
      throw new AppError(status.FORBIDDEN, "This resource is not available to user chat.", "ROLE_NOT_ALLOWED");
  }
};

const resolveAdminResource = async (
  actor: AiChatActor,
  page: PageContext,
): Promise<SafeResourceContext | undefined> => {
  if (!page.resourceId || page.resourceType === "none") return undefined;
  if (!canReadAdminResource(page.resourceType, actor.adminPermissions)) {
    throw new AppError(status.FORBIDDEN, "Your admin permissions do not allow this resource.", "PERMISSION_DENIED");
  }
  if (page.resourceType === "support_ticket") {
    const row = await prisma.adminResource.findFirst({ where: { id: page.resourceId, type: "TICKET" } });
    if (!row) throw new AppError(status.NOT_FOUND, "Support ticket not found.", "RESOURCE_NOT_FOUND");
    const data = record(row.data);
    return { type: "support_ticket", title: String(data.subject ?? "Support ticket"), data: { status: data.status, priority: data.priority, category: data.category, assignedTo: data.assignedTo, preview: data.preview, messages: data.messages, user: record(data.user) } };
  }
  if (page.resourceType === "user") {
    const row = await prisma.user.findUnique({ where: { id: page.resourceId }, select: { name: true, emailVerified: true, role: true, isActive: true, createdAt: true, limits: { select: { resumeLimit: true, resumeUsed: true, apiLimit: true, apiUsed: true, resetAt: true } } } });
    if (!row) throw new AppError(status.NOT_FOUND, "User not found.", "RESOURCE_NOT_FOUND");
    return { type: "user", title: row.name, data: row };
  }
  if (page.resourceType === "invoice") {
    const row = await prisma.invoice.findUnique({ where: { id: page.resourceId }, select: { amountPaid: true, amountDue: true, currency: true, status: true, issuedAt: true, paidAt: true, user: { select: { name: true } } } });
    if (!row) throw new AppError(status.NOT_FOUND, "Invoice not found.", "RESOURCE_NOT_FOUND");
    return { type: "invoice", title: `Invoice for ${row.user.name}`, data: row };
  }
  return undefined;
};

const helpSearch = async (message: string): Promise<HelpContext[]> => {
  const rows = await prisma.adminResource.findMany({ where: { type: "HELP_ARTICLE" }, orderBy: { updatedAt: "desc" }, take: 100 });
  const terms = message.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2).slice(0, 12);
  const cms = rows
    .map((row) => ({ row, data: record(row.data) }))
    .filter(({ data }) => data.status === "PUBLISHED")
    .map(({ row, data }) => ({
      id: row.id,
      title: String(data.title ?? "Help article"),
      slug: String(data.slug ?? row.key ?? row.id),
      excerpt: String(data.excerpt ?? ""),
      body: String(data.body ?? ""),
      score: terms.reduce((score, term) => score + (`${data.title ?? ""} ${data.excerpt ?? ""} ${data.body ?? ""}`.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .map(({ score, ...article }) => ({ ...article, score }));
  const builtIn = BUILT_IN_PUBLIC_HELP.map((article) => ({
    ...article,
    score: terms.reduce((score, term) => score + (`${article.title} ${article.excerpt} ${article.body}`.toLowerCase().includes(term) ? 1 : 0), 0),
  }));
  return [...cms, ...builtIn.filter((article) => !cms.some((item) => item.slug === article.slug))]
    .filter((article) => article.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score: _score, ...article }) => article);
};

const accountContext = async (actor: AiChatActor, route: string): Promise<Record<string, unknown> | undefined> => {
  if (actor.role === "VISITOR") {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { amount: "asc" },
      select: { slug: true, name: true, description: true, amount: true, currency: true, interval: true, features: true, apiLimit: true, resumeLimit: true },
    });
    return { publicPlans: plans };
  }
  if (!actor.userId) return undefined;
  if (actor.role === "USER") {
    const [limits, subscription, profile, upcomingApplications, unreadNotifications, latestResume] = await Promise.all([
      prisma.userLimit.findUnique({ where: { userId: actor.userId }, select: { resumeLimit: true, resumeUsed: true, apiLimit: true, apiUsed: true, resetAt: true } }),
      prisma.subscription.findFirst({ where: { userId: actor.userId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } }, orderBy: { createdAt: "desc" }, select: { status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, plan: { select: { name: true, slug: true } } } }),
      prisma.userProfile.findUnique({ where: { userId: actor.userId }, select: { firstName: true, lastName: true, phone: true, headline: true, bio: true, location: true, website: true, linkedIn: true, github: true, skills: true, languages: true, education: true, experience: true, certifications: true } }),
      prisma.jobApplication.findMany({ where: { userId: actor.userId, reminderAt: { gte: new Date() } }, orderBy: { reminderAt: "asc" }, take: 5, select: { company: true, role: true, status: true, reminderAt: true } }),
      prisma.notification.findMany({ where: { userId: actor.userId, read: false }, orderBy: { createdAt: "desc" }, take: 5, select: { type: true, title: true, link: true, createdAt: true } }),
      prisma.resume.findFirst({ where: { userId: actor.userId }, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, status: true, updatedAt: true } }),
    ]);
    const arrayLength = (value: unknown): number => Array.isArray(value) ? value.length : 0;
    const profileCompleteness = profile ? {
      missing: [
        !profile.firstName || !profile.lastName ? "name" : null,
        !profile.phone ? "phone" : null,
        !profile.headline ? "headline" : null,
        !profile.bio ? "professional summary" : null,
        !profile.location ? "location" : null,
        profile.skills.length === 0 ? "skills" : null,
        arrayLength(profile.experience) === 0 ? "experience" : null,
        arrayLength(profile.education) === 0 ? "education" : null,
      ].filter(Boolean),
      skillsCount: profile.skills.length,
      languagesCount: profile.languages.length,
      experienceCount: arrayLength(profile.experience),
      educationCount: arrayLength(profile.education),
      certificationCount: arrayLength(profile.certifications),
      hasProfessionalLinks: Boolean(profile.website || profile.linkedIn || profile.github),
    } : { missing: ["profile"] };
    return {
      limits,
      plan: subscription?.plan ?? { name: "Free", slug: "free" },
      subscription: subscription ? { status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd } : null,
      profileCompleteness,
      ...(route.startsWith("/dashboard") ? { upcomingApplications, unreadNotifications, latestResume } : {}),
    };
  }
  const base: Record<string, unknown> = { permissions: actor.adminPermissions, twoFactorVerified: actor.twoFactorVerified };
  if (/^\/admin(?:\/|$)/.test(route) && canReadAdminResource("report", actor.adminPermissions)) {
    const [users, resumes, applications, openTickets] = await Promise.all([
      prisma.user.count(), prisma.resume.count(), prisma.jobApplication.count(),
      prisma.adminResource.count({ where: { type: "TICKET", data: { path: ["status"], not: "CLOSED" } } }),
    ]);
    base.metrics = { users, resumes, applications, openTickets };
  }
  return base;
};

export const resolveChatContext = async (input: {
  actor: AiChatActor;
  page: PageContext;
  message: string;
  toolsEnabled: boolean;
  writesEnabled: boolean;
}): Promise<ResolvedChatContext> => {
  const routePurpose = validatePageCapability(input.actor, input.page);
  const [resource, helpArticles, account] = await Promise.all([
    input.actor.role === "VISITOR" ? Promise.resolve(undefined) : input.actor.role === "ADMIN" ? resolveAdminResource(input.actor, input.page) : resolveUserResource(input.actor, input.page),
    helpSearch(input.message),
    accountContext(input.actor, input.page.route),
  ]);
  return {
    actor: input.actor,
    page: input.page,
    routePurpose,
    ...(resource ? { resource } : {}),
    helpArticles,
    ...(account ? { account } : {}),
    availableTools: selectTools(input.actor.role, input.actor.adminPermissions, input.toolsEnabled, input.writesEnabled),
  };
};
