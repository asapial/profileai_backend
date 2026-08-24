import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { Prisma } from "../../prisma/generated/prisma/client";
import { prisma } from "../lib/prisma";
import {
  DEFAULT_CONTENT_PAGES,
  DEFAULT_HOMEPAGE,
  type HomepageConfig,
} from "../modules/content/content.defaults";
import { seedTemplates } from "./seedTemplates";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const HOMEPAGE_SCHEMA_KEY = "homepage_content_schema_version";
const HOMEPAGE_SCHEMA_VERSION = 3;
const TEMPLATE_CATALOG_SCHEMA_KEY = "template_catalog_schema_version";
const TEMPLATE_CATALOG_SCHEMA_VERSION = 2;

const DEFAULT_SETTINGS = [
  ["default_resume_limit", "5", "Default monthly resume allowance"],
  ["default_api_limit", "50", "Default monthly AI allowance"],
  ["max_devices_per_user", "3", "Maximum trusted devices per user"],
  ["otp_expiry_minutes", "10", "One-time-code lifetime"],
  ["session_ttl_days", "7", "Authenticated session lifetime"],
  ["maintenance_mode", "false", "Block non-admin traffic"],
  ["admin_2fa_required", "false", "Require two-factor authentication for admins"],
  [HOMEPAGE_SCHEMA_KEY, "0", "Internal homepage content schema version"],
  [TEMPLATE_CATALOG_SCHEMA_KEY, "0", "Internal résumé and CV template catalog schema version"],
] as const;

/**
 * Add product-managed sections introduced after the first CMS seed without
 * overwriting any copy, order or visibility choices already made by admins.
 * The schema marker makes this a one-time upgrade rather than a recurring
 * reset, so admins can still remove or reorganize sections later.
 */
function upgradeHomepageConfig(value: unknown): HomepageConfig {
  const current =
    value && typeof value === "object"
      ? (value as Partial<HomepageConfig>)
      : {};
  const existingSections = Array.isArray(current.sections)
    ? current.sections
    : [];
  const existingIds = new Set(existingSections.map((section) => section.id));
  const sections = [
    ...existingSections,
    ...DEFAULT_HOMEPAGE.sections.filter((section) => !existingIds.has(section.id)),
  ].map((section) => {
    if (section.id === "features") {
      return {
        ...section,
        ...(section.items
          ? {
              items: section.items.map((item) =>
                item.title === "Premium templates" && item.label === "20+ designs"
                  ? {
                      ...item,
                      label: "60 designs",
                      description: "Choose from 30 résumé and 30 CV designs, each editable and recruiter-friendly.",
                    }
                  : item,
              ),
            }
          : {}),
      };
    }
    if (
      section.id === "templateGallery" &&
      section.description === "From classic single-column to bold creative layouts, all instantly customizable."
    ) {
      return {
        ...section,
        description: "Explore 30 professional résumés and 30 detailed CVs, all instantly customizable.",
      };
    }
    return section;
  });
  const validIds = new Set(sections.map((section) => section.id));
  const currentOrder = Array.isArray(current.sectionOrder)
    ? current.sectionOrder.filter((id) => validIds.has(id))
    : [];
  const sectionOrder = [...currentOrder];
  for (const id of DEFAULT_HOMEPAGE.sectionOrder) {
    if (sectionOrder.includes(id)) continue;
    const defaultIndex = DEFAULT_HOMEPAGE.sectionOrder.indexOf(id);
    const previousDefault = DEFAULT_HOMEPAGE.sectionOrder
      .slice(0, defaultIndex)
      .reverse()
      .find((candidate) => sectionOrder.includes(candidate));
    if (!previousDefault) {
      sectionOrder.unshift(id);
      continue;
    }
    sectionOrder.splice(sectionOrder.indexOf(previousDefault) + 1, 0, id);
  }

  return {
    ...DEFAULT_HOMEPAGE,
    ...current,
    site: {
      ...DEFAULT_HOMEPAGE.site,
      ...(current.site ?? {}),
    },
    navigation: Array.isArray(current.navigation)
      ? current.navigation
      : DEFAULT_HOMEPAGE.navigation,
    sections,
    sectionOrder,
  };
}

const DEFAULT_ADMIN_RESOURCES = [
  {
    type: "FEATURE_FLAG",
    key: "ai_chat_enabled",
    data: {
      key: "ai_chat_enabled",
      name: "AI contextual assistant",
      description: "Enable the role-aware visitor, user and admin assistant.",
      enabled: true,
      rolloutPercent: 100,
      environment: "PRODUCTION",
      targeting: { planIds: [], regions: [], userIds: [] },
    },
  },
  {
    type: "FEATURE_FLAG",
    key: "ai_chat_tools_enabled",
    data: {
      key: "ai_chat_tools_enabled",
      name: "AI chat contextual tools",
      description: "Allow backend-authorized read tools in AI chat.",
      enabled: true,
      rolloutPercent: 100,
      environment: "PRODUCTION",
      targeting: { planIds: [], regions: [], userIds: [] },
    },
  },
  {
    type: "FEATURE_FLAG",
    key: "ai_chat_write_actions_enabled",
    data: {
      key: "ai_chat_write_actions_enabled",
      name: "AI chat confirmed actions",
      description: "Allow reviewed low-risk actions with one-time confirmation.",
      enabled: true,
      rolloutPercent: 100,
      environment: "PRODUCTION",
      targeting: { planIds: [], regions: [], userIds: [] },
    },
  },
  {
    type: "FEATURE_FLAG",
    key: "homepage_cms",
    data: {
      key: "homepage_cms",
      name: "Homepage content management",
      description: "Serve published landing-page content from the database.",
      enabled: true,
      rolloutPercent: 100,
      environment: "PRODUCTION",
      targeting: { planIds: [], regions: [], userIds: [] },
    },
  },
  {
    type: "ANNOUNCEMENT",
    key: "welcome",
    data: {
      title: "Welcome to ProFile AI",
      body: "Build, tailor and track your next application from one workspace.",
      ctaLabel: "Create a resume",
      ctaUrl: "/dashboard/resumes/new",
      status: "DRAFT",
      publishAt: null,
      expiresAt: null,
      audience: { planIds: [], regions: [], signupAgeDays: null },
      severity: "INFO",
      impressions: 0,
      clicks: 0,
    },
  },
  {
    type: "HELP_ARTICLE",
    key: "getting-started",
    data: {
      slug: "getting-started",
      title: "Getting started with ProFile AI",
      excerpt: "Create your profile, choose a template and build your first resume.",
      body: "Complete your profile first so the resume builder can reuse accurate information. Then choose a template, add the target job and review every generated section before exporting.",
      category: "Getting started",
      status: "PUBLISHED",
      authorName: "ProFile AI",
      views: 0,
    },
  },
  {
    type: "TICKET",
    key: "seed-support-guide",
    data: {
      subject: "Support workspace is ready",
      status: "CLOSED",
      priority: "NORMAL",
      user: { id: "system", name: "System", email: "support@profileai.app" },
      category: "SYSTEM",
      assignedTo: null,
      preview: "This seeded record confirms the ticket workspace is connected.",
      messages: [
        {
          id: "seed-message",
          authorId: "system",
          authorName: "ProFile AI",
          authorRole: "BOT",
          body: "New user tickets will appear in this workspace.",
          createdAt: new Date(0).toISOString(),
        },
      ],
    },
  },
] as const;

export async function ensureCoreData(): Promise<{
  settings: number;
  pages: number;
  templates: number;
  resources: number;
}> {
  for (const [key, value, description] of DEFAULT_SETTINGS) {
    await prisma.platformConfig.upsert({
      where: { key },
      update: {},
      create: { key, value, description, updatedBy: "system" },
    });
  }

  const homepage = await prisma.homepageContent.upsert({
    where: { id: "homepage" },
    update: {},
    create: {
      id: "homepage",
      draft: json(DEFAULT_HOMEPAGE),
      published: json(DEFAULT_HOMEPAGE),
      publishedAt: new Date(),
      updatedBy: "system",
    },
  });

  const homepageSchema = await prisma.platformConfig.findUnique({
    where: { key: HOMEPAGE_SCHEMA_KEY },
  });
  if (Number(homepageSchema?.value ?? 0) < HOMEPAGE_SCHEMA_VERSION) {
    await prisma.$transaction([
      prisma.homepageContent.update({
        where: { id: "homepage" },
        data: {
          draft: json(upgradeHomepageConfig(homepage.draft)),
          published: json(upgradeHomepageConfig(homepage.published)),
          updatedBy: "system:homepage-v3",
        },
      }),
      prisma.platformConfig.update({
        where: { key: HOMEPAGE_SCHEMA_KEY },
        data: {
          value: String(HOMEPAGE_SCHEMA_VERSION),
          updatedBy: "system:homepage-v3",
        },
      }),
    ]);
  }

  for (const page of DEFAULT_CONTENT_PAGES) {
    await prisma.contentPage.upsert({
      where: { slug: page.slug },
      update: {},
      create: { ...page, updatedBy: "system" },
    });
  }

  for (const resource of DEFAULT_ADMIN_RESOURCES) {
    await prisma.adminResource.upsert({
      where: { type_key: { type: resource.type, key: resource.key } },
      update: {},
      create: {
        type: resource.type,
        key: resource.key,
        data: json(resource.data),
      },
    });
  }

  if ((await prisma.plan.count()) === 0) {
    await prisma.plan.createMany({
      data: [
        {
          slug: "free",
          name: "Free",
          description: "Essential tools for creating your first resume.",
          stripePriceId: "seed_price_free",
          stripeProductId: "seed_product_free",
          amount: 0,
          currency: "usd",
          interval: "MONTH",
          features: json([
            { key: "resume", label: "1 resume", included: true, limit: 1 },
            { key: "ats", label: "ATS score", included: true },
          ]),
          apiLimit: 3,
          resumeLimit: 1,
        },
        {
          slug: "pro",
          name: "Pro",
          description: "Full toolkit for an active job search.",
          stripePriceId: "seed_price_pro_month",
          stripeProductId: "seed_product_pro",
          amount: 1200,
          currency: "usd",
          interval: "MONTH",
          features: json([
            { key: "resume", label: "Unlimited resumes", included: true },
            { key: "ats", label: "Full ATS suggestions", included: true },
            { key: "cover_letter", label: "Cover letters", included: true },
          ]),
          apiLimit: 500,
          resumeLimit: 100,
        },
        {
          slug: "business",
          name: "Business",
          description: "Team-ready controls for coaches and agencies.",
          stripePriceId: "seed_price_business_month",
          stripeProductId: "seed_product_business",
          amount: 2900,
          currency: "usd",
          interval: "MONTH",
          features: json([
            { key: "pro", label: "Everything in Pro", included: true },
            { key: "team", label: "Team workspace", included: true, limit: 5 },
          ]),
          apiLimit: 2500,
          resumeLimit: 500,
        },
      ],
    });
  }

  const templateCatalogSchema = await prisma.platformConfig.findUnique({
    where: { key: TEMPLATE_CATALOG_SCHEMA_KEY },
  });
  const systemTemplateCount = await prisma.resumeTemplate.count({ where: { ownerId: null } });
  if (
    Number(templateCatalogSchema?.value ?? 0) < TEMPLATE_CATALOG_SCHEMA_VERSION ||
    systemTemplateCount < 60
  ) {
    await seedTemplates("system");
    await prisma.platformConfig.update({
      where: { key: TEMPLATE_CATALOG_SCHEMA_KEY },
      data: {
        value: String(TEMPLATE_CATALOG_SCHEMA_VERSION),
        updatedBy: "system:template-catalog-v2",
      },
    });
  }

  return {
    settings: await prisma.platformConfig.count(),
    pages: await prisma.contentPage.count(),
    templates: await prisma.resumeTemplate.count(),
    resources: await prisma.adminResource.count(),
  };
}

const isCli =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1] as string).href;

if (isCli) {
  ensureCoreData()
    .then((result) => console.log("[seed] Core data ready:", result))
    .catch((error) => {
      console.error("[seed] Core seeding failed:", error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
