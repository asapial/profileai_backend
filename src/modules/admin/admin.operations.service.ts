import status from "http-status";
import bcrypt from "bcryptjs";
import type {
  Prisma,
  ResumeTemplate,
} from "../../../prisma/generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { envVars } from "../../config/env";
import { prisma } from "../../lib/prisma";
import {
  getHomepageEditor,
  publishHomepage,
  saveHomepageDraft,
} from "../content/content.service";
import type { HomepageConfig } from "../content/content.defaults";
import { createRoleNotification } from "../notification/notification.service";
import { reviewUserTemplate } from "../template/template.service";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const object = (value: Prisma.JsonValue): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const resourceDto = (row: {
  id: string;
  data: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> & {
  id: string;
  createdAt: string;
  updatedAt: string;
} => ({
  id: row.id,
  ...object(row.data),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const listResources = async (type: string) => {
  const rows = await prisma.adminResource.findMany({
    where: { type },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(resourceDto);
};

const getResource = async (type: string, id: string) => {
  const row = await prisma.adminResource.findFirst({ where: { id, type } });
  if (!row) throw new AppError(status.NOT_FOUND, `${type} record not found.`);
  return row;
};

const createResource = async (
  type: string,
  payload: Record<string, unknown>,
  key?: string,
) => {
  const row = await prisma.adminResource.create({
    data: { type, key: key ?? null, data: json(payload) },
  });
  return resourceDto(row);
};

const updateResource = async (
  type: string,
  id: string,
  patch: Record<string, unknown>,
) => {
  const existing = await getResource(type, id);
  const row = await prisma.adminResource.update({
    where: { id },
    data: { data: json({ ...object(existing.data), ...patch }) },
  });
  return resourceDto(row);
};

export const homepage = {
  get: getHomepageEditor,
  save: (draft: HomepageConfig, adminId: string) =>
    saveHomepageDraft(draft, adminId),
  publish: async (adminId: string) => {
    const row = await publishHomepage(adminId);
    await createRoleNotification("ADMIN", {
      type: "SYSTEM",
      title: "Homepage published",
      body: `Version ${row.version} is now live.`,
      link: "/admin/homepage",
    });
    return row;
  },
};

export const featureFlags = {
  list: () => listResources("FEATURE_FLAG"),
  create: (payload: Record<string, unknown>) =>
    createResource("FEATURE_FLAG", payload, String(payload.key ?? "")),
  update: (id: string, payload: Record<string, unknown>) =>
    updateResource("FEATURE_FLAG", id, payload),
  remove: async (id: string) => {
    await getResource("FEATURE_FLAG", id);
    await prisma.adminResource.delete({ where: { id } });
    return { ok: true as const };
  },
};

export const announcements = {
  list: () => listResources("ANNOUNCEMENT"),
  create: (payload: Record<string, unknown>) =>
    createResource("ANNOUNCEMENT", {
      impressions: 0,
      clicks: 0,
      ...payload,
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    updateResource("ANNOUNCEMENT", id, payload),
  publish: async (id: string) => {
    const updated = await updateResource("ANNOUNCEMENT", id, {
      status: "LIVE",
      publishAt: new Date().toISOString(),
    });
    await createRoleNotification("USER", {
      type: "SYSTEM",
      title: String(updated.title ?? "Announcement"),
      body: String(updated.body ?? ""),
      link: updated.ctaUrl ? String(updated.ctaUrl) : "/dashboard",
    });
    return updated;
  },
  retire: (id: string) =>
    updateResource("ANNOUNCEMENT", id, {
      status: "EXPIRED",
      expiresAt: new Date().toISOString(),
    }),
};

export const tickets = {
  createFromUser: async (input: {
    userId: string;
    subject: string;
    category: string;
    priority: string;
    description: string;
    context?: Record<string, unknown>;
  }) => {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new AppError(status.NOT_FOUND, "User not found.");
    return createResource("TICKET", {
      subject: input.subject,
      status: "OPEN",
      priority: input.priority,
      category: input.category,
      user,
      assignedTo: null,
      preview: input.description,
      context: input.context ?? {},
      source: "AI_CHAT_CONFIRMED",
      messages: [
        {
          id: crypto.randomUUID(),
          authorId: user.id,
          authorName: user.name,
          authorRole: "USER",
          body: input.description,
          createdAt: new Date().toISOString(),
        },
      ],
    });
  },
  list: async (filters: {
    status?: string | undefined;
    q?: string | undefined;
  }) => {
    const items = await listResources("TICKET");
    const q = filters.q?.toLowerCase();
    return items.filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (
        q &&
        !`${String(item.subject ?? "")} ${JSON.stringify(item.user ?? {})}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  },
  detail: async (id: string) => resourceDto(await getResource("TICKET", id)),
  update: (id: string, payload: Record<string, unknown>) =>
    updateResource("TICKET", id, payload),
  reply: async (
    id: string,
    body: string,
    admin: { id: string; email: string },
  ) => {
    if (!body.trim()) throw new AppError(status.BAD_REQUEST, "Reply cannot be empty.");
    const row = await getResource("TICKET", id);
    const data = object(row.data);
    const message = {
      id: crypto.randomUUID(),
      authorId: admin.id,
      authorName: admin.email,
      authorRole: "ADMIN",
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };
    const messages = Array.isArray(data.messages) ? data.messages : [];
    await updateResource("TICKET", id, {
      messages: [...messages, message],
      preview: body.trim(),
      status: data.status === "CLOSED" ? "PENDING" : data.status,
    });
    return message;
  },
};

export const helpArticles = {
  list: async (filters: {
    status?: string | undefined;
    category?: string | undefined;
    q?: string | undefined;
  }) => {
    const items = await listResources("HELP_ARTICLE");
    const q = filters.q?.toLowerCase();
    return items.filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (filters.category && item.category !== filters.category) return false;
      if (
        q &&
        !`${String(item.title ?? "")} ${String(item.excerpt ?? "")}`
          .toLowerCase()
          .includes(q)
      ) {
        return false;
      }
      return true;
    });
  },
  categories: async () => {
    const items = await listResources("HELP_ARTICLE");
    const counts = new Map<string, number>();
    for (const item of items) {
      const name = String(item.category ?? "General");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].map(([name, articleCount]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      articleCount,
    }));
  },
  detail: async (id: string) =>
    resourceDto(await getResource("HELP_ARTICLE", id)),
  create: (payload: Record<string, unknown>, authorName: string) =>
    createResource(
      "HELP_ARTICLE",
      { status: "DRAFT", views: 0, authorName, ...payload },
      String(payload.slug ?? ""),
    ),
  update: (id: string, payload: Record<string, unknown>) =>
    updateResource("HELP_ARTICLE", id, payload),
};

export const moderation = {
  list: async (filters: {
    status?: string | undefined;
    kind?: string | undefined;
    q?: string | undefined;
  }) => {
    const items = await listResources("MODERATION");
    const q = filters.q?.toLowerCase();
    return items.filter((item) => {
      if (filters.status && item.status !== filters.status) return false;
      if (filters.kind && item.kind !== filters.kind) return false;
      return !q || `${item.title ?? ""} ${item.preview ?? ""}`.toLowerCase().includes(q);
    });
  },
  resolve: (id: string, action: string, adminId: string, note?: string) =>
    updateResource("MODERATION", id, {
      status: action,
      note: note ?? null,
      resolvedAt: new Date().toISOString(),
      resolvedBy: adminId,
    }),
};

const auditCategory = (action: string): string => {
  const upper = action.toUpperCase();
  if (upper.includes("LOGIN") || upper.includes("AUTH")) return "AUTH";
  if (upper.includes("USER")) return "USER";
  if (upper.includes("BILL")) return "BILLING";
  if (upper.includes("TEMPLATE")) return "TEMPLATE";
  if (upper.includes("CONTENT") || upper.includes("HOMEPAGE")) return "CONTENT";
  if (upper.includes("SETTING")) return "SETTINGS";
  if (upper.includes("SECURITY") || upper.includes("BAN")) return "SECURITY";
  return "OTHER";
};

export const audit = {
  list: async (filters: Record<string, string | undefined>) => {
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(filters.actorId ? { actorId: filters.actorId } : {}),
        ...(filters.action
          ? { action: { contains: filters.action, mode: "insensitive" } }
          : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    const actors = await prisma.user.findMany({
      where: { id: { in: rows.flatMap((row) => (row.actorId ? [row.actorId] : [])) } },
      select: { id: true, email: true, name: true },
    });
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
    return rows
      .map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actor: row.actorId
          ? actorMap.get(row.actorId) ?? {
              id: row.actorId,
              email: row.actorEmail ?? "unknown",
              name: null,
            }
          : null,
        action: row.action,
        category: auditCategory(row.action),
        target: row.entityType && row.entityId
          ? { type: row.entityType, id: row.entityId }
          : null,
        ip: row.ipAddress,
        userAgent: row.userAgent,
        payload: object(row.metadata ?? {}),
      }))
      .filter(
        (entry) =>
          !filters.category ||
          filters.category === "ALL" ||
          entry.category === filters.category,
      )
      .filter(
        (entry) =>
          !filters.search ||
          JSON.stringify(entry).toLowerCase().includes(filters.search.toLowerCase()),
      );
  },
  detail: async (id: string) => {
    const items = await audit.list({});
    const entry = items.find((item) => item.id === id);
    if (!entry) throw new AppError(status.NOT_FOUND, "Audit entry not found.");
    return {
      ...entry,
      before: (entry.payload.before as Record<string, unknown> | undefined) ?? null,
      after: (entry.payload.after as Record<string, unknown> | undefined) ?? null,
    };
  },
  exportUrl: async (filters: Record<string, string | undefined>) => {
    const items = await audit.list(filters);
    const csv = [
      "createdAt,actor,action,category,target,ip",
      ...items.map((item) =>
        [
          item.createdAt,
          item.actor?.email ?? "",
          item.action,
          item.category,
          item.target?.id ?? "",
          item.ip ?? "",
        ]
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    return { url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}` };
  },
};

export const security = {
  summary: async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [bannedUsers, activeAdmins, adminsWithMfa, highRiskSessions, alerts] =
      await Promise.all([
        prisma.user.count({ where: { isActive: false } }),
        prisma.user.count({ where: { role: "ADMIN", isActive: true } }),
        prisma.user.count({
          where: { role: "ADMIN", isActive: true, twoFactorEnabled: true },
        }),
        prisma.session.count({
          where: { updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        }),
        prisma.securityAlert.count({ where: { createdAt: { gte: since } } }),
      ]);
    return {
      failedLogins24h: alerts,
      failedLoginsTrend: [],
      suspiciousIps: [],
      mfa: {
        enabledCount: adminsWithMfa,
        disabledCount: Math.max(0, activeAdmins - adminsWithMfa),
        enforcedRoles: ["ADMIN"],
      },
      bannedUsers,
      activeAdmins,
      highRiskSessions,
    };
  },
};

const planDto = (plan: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  features: Prisma.JsonValue;
  isActive: boolean;
  stripePriceId: string;
  subscriptions?: Array<{ id: string }>;
}) => ({
  id: plan.id,
  slug: plan.slug,
  name: plan.name,
  description: plan.description ?? "",
  priceMonthly: plan.amount / 100,
  priceYearly: Math.round((plan.amount * 10) / 100),
  currency: plan.currency,
  features: plan.features,
  isDefault: plan.slug === "free",
  isArchived: !plan.isActive,
  stripePriceIdMonthly: plan.stripePriceId.startsWith("seed_")
    ? null
    : plan.stripePriceId,
  stripePriceIdYearly: null,
  trialDays: 0,
  activeSubscribers: plan.subscriptions?.length ?? 0,
});

export const plans = {
  list: async () => {
    const rows = await prisma.plan.findMany({
      include: {
        subscriptions: {
          where: { status: { in: ["ACTIVE", "TRIALING"] } },
          select: { id: true },
        },
      },
      orderBy: { amount: "asc" },
    });
    return rows.map(planDto);
  },
  create: async (payload: Record<string, unknown>) => {
    const slug = String(payload.slug ?? "").toLowerCase();
    if (!slug) throw new AppError(status.BAD_REQUEST, "Plan slug is required.");
    const row = await prisma.plan.create({
      data: {
        slug,
        name: String(payload.name ?? slug),
        description: String(payload.description ?? ""),
        stripePriceId: String(payload.stripePriceIdMonthly ?? `manual_${slug}_${Date.now()}`),
        stripeProductId: `manual_product_${slug}`,
        amount: Math.round(Number(payload.priceMonthly ?? 0) * 100),
        currency: String(payload.currency ?? "usd").toLowerCase(),
        interval: "MONTH",
        features: json(payload.features ?? []),
        isActive: !Boolean(payload.isArchived),
      },
    });
    return planDto(row);
  },
  update: async (id: string, payload: Record<string, unknown>) => {
    const row = await prisma.plan.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: String(payload.name) } : {}),
        ...(payload.description !== undefined
          ? { description: String(payload.description) }
          : {}),
        ...(payload.priceMonthly !== undefined
          ? { amount: Math.round(Number(payload.priceMonthly) * 100) }
          : {}),
        ...(payload.currency !== undefined
          ? { currency: String(payload.currency).toLowerCase() }
          : {}),
        ...(payload.features !== undefined ? { features: json(payload.features) } : {}),
        ...(payload.isArchived !== undefined
          ? { isActive: !Boolean(payload.isArchived) }
          : {}),
      },
    });
    return planDto(row);
  },
  archive: async (id: string) => {
    const row = await prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
    return planDto(row);
  },
};

const couponDto = (coupon: {
  id: string;
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string;
  maxRedemptions: number | null;
  redeemed: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}) => ({
  id: coupon.id,
  code: coupon.code,
  description: "",
  discountType: coupon.percentOff !== null ? "PERCENT" : "FIXED",
  percentOff: coupon.percentOff ?? 0,
  amountOff: (coupon.amountOff ?? 0) / 100,
  currency: coupon.currency,
  startsAt: coupon.createdAt.toISOString(),
  expiresAt: coupon.expiresAt?.toISOString() ?? null,
  maxRedemptions: coupon.maxRedemptions ?? 0,
  redemptions: coupon.redeemed,
  isActive: coupon.isActive,
  planIds: [],
});

export const coupons = {
  list: async (filters: {
    status?: string | undefined;
    search?: string | undefined;
  }) => {
    const rows = await prisma.coupon.findMany({
      where: {
        ...(filters.search
          ? { code: { contains: filters.search, mode: "insensitive" } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    return rows.map(couponDto).filter((coupon) => {
      if (!filters.status || filters.status === "all") return true;
      if (filters.status === "active")
        return coupon.isActive && (!coupon.expiresAt || new Date(coupon.expiresAt) > now);
      if (filters.status === "expired")
        return Boolean(coupon.expiresAt && new Date(coupon.expiresAt) <= now);
      if (filters.status === "exhausted")
        return coupon.maxRedemptions > 0 && coupon.redemptions >= coupon.maxRedemptions;
      return true;
    });
  },
  create: async (payload: Record<string, unknown>) => {
    const discountType = String(payload.discountType ?? "PERCENT");
    const row = await prisma.coupon.create({
      data: {
        code: String(payload.code ?? "").toUpperCase(),
        percentOff:
          discountType === "PERCENT" ? Number(payload.percentOff ?? 0) : null,
        amountOff:
          discountType === "FIXED"
            ? Math.round(Number(payload.amountOff ?? 0) * 100)
            : null,
        currency: String(payload.currency ?? "usd").toLowerCase(),
        maxRedemptions: Number(payload.maxRedemptions ?? 0) || null,
        expiresAt: payload.expiresAt ? new Date(String(payload.expiresAt)) : null,
        isActive: payload.isActive !== false,
      },
    });
    return couponDto(row);
  },
  update: async (id: string, payload: Record<string, unknown>) => {
    const row = await prisma.coupon.update({
      where: { id },
      data: {
        ...(payload.code !== undefined
          ? { code: String(payload.code).toUpperCase() }
          : {}),
        ...(payload.percentOff !== undefined
          ? { percentOff: Number(payload.percentOff) }
          : {}),
        ...(payload.amountOff !== undefined
          ? { amountOff: Math.round(Number(payload.amountOff) * 100) }
          : {}),
        ...(payload.expiresAt !== undefined
          ? {
              expiresAt: payload.expiresAt
                ? new Date(String(payload.expiresAt))
                : null,
            }
          : {}),
        ...(payload.maxRedemptions !== undefined
          ? { maxRedemptions: Number(payload.maxRedemptions) || null }
          : {}),
        ...(payload.isActive !== undefined
          ? { isActive: Boolean(payload.isActive) }
          : {}),
      },
    });
    return couponDto(row);
  },
  deactivate: async (id: string) =>
    couponDto(
      await prisma.coupon.update({ where: { id }, data: { isActive: false } }),
    ),
};

const invoiceDto = (
  invoice: {
    id: string;
    stripeInvoiceId: string;
    userId: string;
    amountPaid: number;
    currency: string;
    status: string;
    issuedAt: Date;
    paidAt: Date | null;
    hostedInvoiceUrl: string | null;
    user: { email: string; subscriptions: Array<{ plan: { name: string } }> };
  },
  refundedAmount = 0,
) => ({
  id: invoice.id,
  number: invoice.stripeInvoiceId,
  userId: invoice.userId,
  userEmail: invoice.user.email,
  planName: invoice.user.subscriptions[0]?.plan.name ?? "Unknown",
  amount: invoice.amountPaid / 100,
  currency: invoice.currency,
  status: refundedAmount > 0 ? "REFUNDED" : invoice.status,
  issuedAt: invoice.issuedAt.toISOString(),
  paidAt: invoice.paidAt?.toISOString() ?? null,
  refundedAmount,
  invoiceUrl: invoice.hostedInvoiceUrl ?? "",
});

export const invoices = {
  list: async (filters: {
    status?: string | undefined;
    search?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }) => {
    const rows = await prisma.invoice.findMany({
      where: {
        ...(filters.from || filters.to
          ? {
              issuedAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                { stripeInvoiceId: { contains: filters.search, mode: "insensitive" } },
                { user: { email: { contains: filters.search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        user: {
          select: {
            email: true,
            subscriptions: {
              include: { plan: { select: { name: true } } },
              take: 1,
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    });
    const refunds = await prisma.adminResource.findMany({
      where: { type: "INVOICE_REFUND", key: { in: rows.map((row) => row.id) } },
    });
    const refundMap = new Map(
      refunds.map((refund) => [
        refund.key,
        Number(object(refund.data).amount ?? 0),
      ]),
    );
    return rows
      .map((row) => invoiceDto(row, refundMap.get(row.id) ?? 0))
      .filter(
        (invoice) =>
          !filters.status ||
          filters.status === "ALL" ||
          invoice.status === filters.status,
      );
  },
  refund: async (id: string, amount?: number) => {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            subscriptions: {
              include: { plan: { select: { name: true } } },
              take: 1,
            },
          },
        },
      },
    });
    if (!invoice) throw new AppError(status.NOT_FOUND, "Invoice not found.");
    const refundAmount = amount ?? invoice.amountPaid / 100;
    await prisma.adminResource.upsert({
      where: { type_key: { type: "INVOICE_REFUND", key: id } },
      update: {
        data: json({
          amount: refundAmount,
          recordedAt: new Date().toISOString(),
        }),
      },
      create: {
        type: "INVOICE_REFUND",
        key: id,
        data: json({
          amount: refundAmount,
          recordedAt: new Date().toISOString(),
        }),
      },
    });
    return invoiceDto(invoice, refundAmount);
  },
  exportUrl: async (filters: {
    status?: string | undefined;
    search?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }) => {
    const rows = await invoices.list(filters);
    const csv = [
      "number,email,plan,amount,currency,status,issuedAt",
      ...rows.map((row) =>
        [row.number, row.userEmail, row.planName, row.amount, row.currency, row.status, row.issuedAt]
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n");
    return { url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}` };
  },
};

export const adminProfile = {
  get: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { adminProfile: true },
    });
    if (!user) throw new AppError(status.NOT_FOUND, "Admin not found.");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      twoFactorEnabled: user.twoFactorEnabled,
      profile: user.adminProfile
        ? {
            firstName: user.adminProfile.firstName,
            lastName: user.adminProfile.lastName,
            avatarUrl: user.adminProfile.avatarUrl,
            phone: user.adminProfile.phone,
          }
        : null,
    };
  },
  update: async (
    userId: string,
    payload: { firstName: string; lastName: string; phone?: string | null },
  ) => {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { name: `${payload.firstName} ${payload.lastName}`.trim() },
      }),
      prisma.adminProfile.upsert({
        where: { userId },
        update: {
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone ?? null,
        },
        create: {
          userId,
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone ?? null,
          permissions: [],
        },
      }),
    ]);
    return adminProfile.get(userId);
  },
  sessions: async (userId: string, currentToken?: string) => {
    const rows = await prisma.session.findMany({
      where: { userId },
      include: { device: true },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceLabel: session.device?.deviceName ?? null,
      isCurrent: session.token === currentToken,
      lastActiveAt: session.updatedAt,
      createdAt: session.createdAt,
    }));
  },
  devices: async (userId: string) => {
    const rows = await prisma.loginDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    });
    return rows.map((device) => ({
      id: device.id,
      ipAddress: device.ipAddress,
      deviceLabel: device.deviceName,
      location: null,
      lastLoginAt: device.lastSeenAt,
      isTrusted: device.isTrusted,
    }));
  },
  changePassword: async (
    userId: string,
    currentPassword: string,
    newPassword: string,
    currentToken?: string,
  ) => {
    if (newPassword.length < 8) {
      throw new AppError(status.BAD_REQUEST, "New password must be at least 8 characters.");
    }
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "credential" },
    });
    if (!account?.password || !(await bcrypt.compare(currentPassword, account.password))) {
      throw new AppError(status.UNAUTHORIZED, "Current password is incorrect.");
    }
    await prisma.account.update({
      where: { id: account.id },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });
    const revoked = await prisma.session.deleteMany({
      where: { userId, ...(currentToken ? { token: { not: currentToken } } : {}) },
    });
    return { ok: true as const, revokedOtherSessions: revoked.count };
  },
  toggleTwoFactor: async (userId: string, enabled: boolean) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });
    if (enabled && !user?.twoFactorSecret) {
      throw new AppError(
        status.BAD_REQUEST,
        "Set up two-factor authentication from the security flow before enabling it.",
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: enabled },
    });
    return { ok: true as const, enabled };
  },
  revokeSession: async (userId: string, id: string) => {
    await prisma.session.deleteMany({ where: { id, userId } });
    return { status: "revoked" as const, auditLogId: crypto.randomUUID() };
  },
  revokeAllSessions: async (userId: string) => {
    const result = await prisma.session.deleteMany({ where: { userId } });
    return { revoked: result.count };
  },
  revokeDevice: async (userId: string, id: string) => {
    await prisma.loginDevice.deleteMany({ where: { id, userId } });
    return { status: "revoked" as const, auditLogId: crypto.randomUUID() };
  },
  trustDevice: async (userId: string, id: string, trusted: boolean) => {
    const device = await prisma.loginDevice.update({
      where: { id, userId },
      data: { isTrusted: trusted },
    });
    return {
      id: device.id,
      ipAddress: device.ipAddress,
      deviceLabel: device.deviceName,
      location: null,
      lastLoginAt: device.lastSeenAt,
      isTrusted: device.isTrusted,
    };
  },
};

const templateDto = (
  row: ResumeTemplate & {
    _count?: { resumes: number };
    owner?: { id: string; name: string; email: string } | null;
  },
  config?: Prisma.JsonValue,
) => {
  const saved = object(config ?? {});
  return {
    ...row,
    isAtsFriendly:
      typeof saved.isAtsFriendly === "boolean" ? saved.isAtsFriendly : true,
    layoutConfig: object(
      (saved.layoutConfig as Prisma.JsonValue | undefined) ?? {},
    ),
  };
};

export const templates = {
  list: async (filters: {
    category?: string;
    documentType?: string;
    reviewStatus?: string;
  } = {}) => {
    const rows = await prisma.resumeTemplate.findMany({
      where: {
        ...(filters.category && filters.category !== "ALL"
          ? { category: filters.category as never }
          : {}),
        ...(filters.documentType && filters.documentType !== "ALL"
          ? { documentType: filters.documentType as never }
          : {}),
        ...(filters.reviewStatus && filters.reviewStatus !== "ALL"
          ? { reviewStatus: filters.reviewStatus as never }
          : {}),
      },
      include: {
        _count: { select: { resumes: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: [
        { reviewStatus: "asc" },
        { submittedAt: "desc" },
        { isDefault: "desc" },
        { displayOrder: "asc" },
      ],
    });
    const configs = await prisma.adminResource.findMany({
      where: {
        type: "TEMPLATE_CONFIG",
        key: { in: rows.map((row) => row.id) },
      },
    });
    const configMap = new Map(configs.map((config) => [config.key, config.data]));
    return rows.map((row) => templateDto(row, configMap.get(row.id)));
  },
  detail: async (id: string) => {
    const [row, config] = await Promise.all([
      prisma.resumeTemplate.findUnique({
        where: { id },
        include: {
          _count: { select: { resumes: true } },
          owner: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.adminResource.findUnique({
        where: { type_key: { type: "TEMPLATE_CONFIG", key: id } },
      }),
    ]);
    if (!row) throw new AppError(status.NOT_FOUND, "Template not found.");
    return templateDto(row, config?.data);
  },
  history: async (id: string) => {
    const rows = await prisma.auditLog.findMany({
      where: { action: "TEMPLATE_UPDATED", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return rows.map((row) => ({
      id: row.id,
      savedAt: row.createdAt,
      savedBy: row.actorEmail ?? row.actorId ?? "system",
      configSnapshot: object(row.metadata ?? {}),
    }));
  },
  create: async (payload: Record<string, unknown>, adminId: string) => {
    const layout = object(json(payload.layoutConfig ?? {}) as Prisma.JsonValue);
    const row = await prisma.resumeTemplate.create({
      data: {
        name: String(payload.name ?? "Untitled template"),
        description: payload.description ? String(payload.description) : null,
        category: String(payload.category ?? "MODERN") as never,
        documentType: String(payload.documentType ?? "RESUME") as never,
        thumbnailUrl: String(payload.thumbnailUrl ?? "/templates/aurora.svg"),
        htmlLayout:
          '<article class="managed-template"><h1>{{firstName}} {{lastName}}</h1><p>{{headline}}</p>{{#if bio}}<section><h2>Summary</h2><p>{{bio}}</p></section>{{/if}}</article>',
        cssStyles: `.managed-template{font-family:${String(layout.fontFamily ?? "Inter")},sans-serif;color:#111827;padding:2rem}.managed-template h2{color:${String(layout.accentColor ?? "#7c3aed")}}`,
        isActive: Boolean(payload.isActive),
        reviewStatus: "APPROVED",
        createdBy: adminId,
      },
    });
    await prisma.adminResource.create({
      data: {
        type: "TEMPLATE_CONFIG",
        key: row.id,
        data: json({
          isAtsFriendly: payload.isAtsFriendly !== false,
          layoutConfig: layout,
        }),
      },
    });
    return templateDto(row, json({
      isAtsFriendly: payload.isAtsFriendly !== false,
      layoutConfig: layout,
    }) as Prisma.JsonValue);
  },
  update: async (
    id: string,
    payload: Record<string, unknown>,
    admin: { id: string; email: string },
  ) => {
    const current = await templates.detail(id);
    const snapshot = await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "TEMPLATE_UPDATED",
        entityType: "ResumeTemplate",
        entityId: id,
        metadata: json({
          name: current.name,
          description: current.description,
          category: current.category,
          thumbnailUrl: current.thumbnailUrl,
          isAtsFriendly: current.isAtsFriendly,
          ...current.layoutConfig,
        }),
      },
    });
    const row = await prisma.resumeTemplate.update({
      where: { id },
      data: {
        ...(payload.name !== undefined ? { name: String(payload.name) } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description ? String(payload.description) : null }
          : {}),
        ...(payload.category !== undefined
          ? { category: String(payload.category) as never }
          : {}),
        ...(payload.documentType !== undefined
          ? { documentType: String(payload.documentType) as never }
          : {}),
        ...(payload.thumbnailUrl !== undefined
          ? { thumbnailUrl: String(payload.thumbnailUrl || current.thumbnailUrl) }
          : {}),
      },
    });
    const currentLayout = current.layoutConfig;
    const nextLayout =
      payload.layoutConfig === undefined
        ? currentLayout
        : {
            ...currentLayout,
            ...object(json(payload.layoutConfig) as Prisma.JsonValue),
          };
    await prisma.adminResource.upsert({
      where: { type_key: { type: "TEMPLATE_CONFIG", key: id } },
      update: {
        data: json({
          isAtsFriendly:
            payload.isAtsFriendly === undefined
              ? current.isAtsFriendly
              : Boolean(payload.isAtsFriendly),
          layoutConfig: nextLayout,
        }),
      },
      create: {
        type: "TEMPLATE_CONFIG",
        key: id,
        data: json({
          isAtsFriendly:
            payload.isAtsFriendly === undefined
              ? current.isAtsFriendly
              : Boolean(payload.isAtsFriendly),
          layoutConfig: nextLayout,
        }),
      },
    });
    return { id: row.id, historySnapshotId: snapshot.id };
  },
  status: (id: string, isActive: boolean) =>
    prisma.resumeTemplate.update({ where: { id }, data: { isActive } }),
  review: (
    id: string,
    adminId: string,
    payload: { decision: "APPROVED" | "REJECTED"; reason?: string },
  ) => reviewUserTemplate(adminId, id, payload),
  setDefault: async (id: string) => {
    const previous = await prisma.resumeTemplate.findFirst({
      where: { isDefault: true },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.resumeTemplate.updateMany({ data: { isDefault: false } }),
      prisma.resumeTemplate.update({ where: { id }, data: { isDefault: true } }),
    ]);
    return { id, isDefault: true as const, previousDefaultId: previous?.id ?? null };
  },
  remove: async (id: string) => {
    const row = await templates.detail(id);
    if ((row._count?.resumes ?? 0) > 0) {
      throw new AppError(status.CONFLICT, "Template is in use and cannot be deleted.");
    }
    await prisma.resumeTemplate.delete({ where: { id } });
    return { status: "deleted" as const, id };
  },
};

export const operational = {
  resumes: () =>
    prisma.resume.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        template: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  exports: () =>
    prisma.exportJob.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  reports: async () => {
    const [users, resumes, applications, exports, revenue] = await Promise.all([
      prisma.user.count({ where: { role: "USER" } }),
      prisma.resume.count(),
      prisma.jobApplication.count(),
      prisma.exportJob.count(),
      prisma.invoice.aggregate({ _sum: { amountPaid: true } }),
    ]);
    return {
      users,
      resumes,
      applications,
      exports,
      revenue: (revenue._sum.amountPaid ?? 0) / 100,
      generatedAt: new Date(),
    };
  },
};

export const sectionSettings = {
  get: async (key: string) => {
    const row = await prisma.adminResource.findUnique({
      where: { type_key: { type: "ADMIN_SETTING", key } },
    });
    return row ? object(row.data) : {};
  },
  put: async (key: string, payload: Record<string, unknown>) => {
    const row = await prisma.adminResource.upsert({
      where: { type_key: { type: "ADMIN_SETTING", key } },
      update: { data: json(payload) },
      create: { type: "ADMIN_SETTING", key, data: json(payload) },
    });
    return object(row.data);
  },
  testEmail: () => ({
    ok: true,
    message:
      envVars.EMAIL_SENDER.SMTP_HOST
        ? "SMTP configuration is present."
        : "SMTP is not configured.",
  }),
};
