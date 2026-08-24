import status from "http-status";
import { Prisma } from "../../../prisma/generated/prisma/client";
import AppError from "../../errorHelpers/AppError";
import { prisma } from "../../lib/prisma";
import { DEFAULT_HOMEPAGE, type HomepageConfig } from "./content.defaults";

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

export const getPublishedHomepage = async (): Promise<HomepageConfig> => {
  const row = await prisma.homepageContent.findUnique({
    where: { id: "homepage" },
  });
  return (row?.published as unknown as HomepageConfig | undefined) ?? DEFAULT_HOMEPAGE;
};

export const getHomepageEditor = async () => {
  const row = await prisma.homepageContent.findUnique({
    where: { id: "homepage" },
  });
  if (!row) {
    return {
      id: "homepage",
      draft: DEFAULT_HOMEPAGE,
      published: DEFAULT_HOMEPAGE,
      version: 1,
      updatedBy: null,
      updatedAt: new Date().toISOString(),
      publishedAt: null,
    };
  }
  return row;
};

export const saveHomepageDraft = async (
  draft: HomepageConfig,
  adminUserId: string,
) => {
  validateHomepageConfig(draft);
  return prisma.homepageContent.upsert({
    where: { id: "homepage" },
    update: { draft: asJson(draft), updatedBy: adminUserId },
    create: {
      id: "homepage",
      draft: asJson(draft),
      published: asJson(DEFAULT_HOMEPAGE),
      updatedBy: adminUserId,
    },
  });
};

export const publishHomepage = async (adminUserId: string) => {
  const current = await prisma.homepageContent.findUnique({
    where: { id: "homepage" },
  });
  const draft =
    (current?.draft as unknown as HomepageConfig | undefined) ?? DEFAULT_HOMEPAGE;
  validateHomepageConfig(draft);

  return prisma.homepageContent.upsert({
    where: { id: "homepage" },
    update: {
      published: asJson(draft),
      version: { increment: 1 },
      updatedBy: adminUserId,
      publishedAt: new Date(),
    },
    create: {
      id: "homepage",
      draft: asJson(draft),
      published: asJson(draft),
      version: 1,
      updatedBy: adminUserId,
      publishedAt: new Date(),
    },
  });
};

export const getContentPage = async (slug: string) => {
  const page = await prisma.contentPage.findFirst({
    where: { slug, published: true },
    select: {
      slug: true,
      title: true,
      description: true,
      body: true,
      updatedAt: true,
    },
  });
  if (!page) throw new AppError(status.NOT_FOUND, "Content page not found.");
  return page;
};

export const validateHomepageConfig = (value: HomepageConfig): void => {
  if (!value || typeof value !== "object") {
    throw new AppError(status.BAD_REQUEST, "Homepage content must be an object.");
  }
  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new AppError(status.BAD_REQUEST, "Homepage content requires at least one section.");
  }
  if (!Array.isArray(value.sectionOrder)) {
    throw new AppError(status.BAD_REQUEST, "Homepage sectionOrder must be an array.");
  }
  const ids = new Set<string>();
  for (const section of value.sections) {
    if (!section.id || ids.has(section.id)) {
      throw new AppError(status.BAD_REQUEST, "Homepage section IDs must be unique.");
    }
    ids.add(section.id);
    if (typeof section.enabled !== "boolean") {
      throw new AppError(
        status.BAD_REQUEST,
        `Section ${section.id} must define an enabled boolean.`,
      );
    }
    for (const cta of [section.primaryCta, section.secondaryCta]) {
      if (cta && (!cta.label.trim() || !cta.href.trim())) {
        throw new AppError(
          status.BAD_REQUEST,
          `Section ${section.id} has an incomplete call-to-action.`,
        );
      }
    }
  }
  for (const id of value.sectionOrder) {
    if (!ids.has(id)) {
      throw new AppError(
        status.BAD_REQUEST,
        `sectionOrder references unknown section "${id}".`,
      );
    }
  }
};
