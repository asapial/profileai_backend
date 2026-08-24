import status from 'http-status';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { uploadBuffer, getPresignedUrl } from '../../lib/minio';
import AppError from '../../errorHelpers/AppError';
import { createNotification, createRoleNotification } from '../notification/notification.service';
import {
  CreateTemplateInput,
  ForkUserTemplateInput,
  ReviewUserTemplateInput,
  TemplateCustomizationInput,
  UpdateTemplateInput,
  UpdateUserTemplateInput,
} from './template.schema';

// Sample data for template preview rendering
export const SAMPLE_RESUME_DATA = {
  firstName: 'Alex',
  lastName: 'Johnson',
  email: 'alex.johnson@email.com',
  phone: '+1 (555) 123-4567',
  location: 'San Francisco, CA',
  website: 'https://alexjohnson.dev',
  linkedIn: 'https://linkedin.com/in/alexjohnson',
  headline: 'Senior Full-Stack Engineer',
  bio: 'Passionate software engineer with 6+ years of experience building scalable web applications.',
  skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS'],
  languages: ['English', 'Spanish'],
  experience: [
    {
      company: 'TechCorp Inc.',
      role: 'Senior Software Engineer',
      from: '2021',
      to: 'Present',
      current: true,
      desc: 'Led development of microservices architecture serving 2M+ users. Reduced API latency by 40%.',
    },
    {
      company: 'StartupXYZ',
      role: 'Software Engineer',
      from: '2018',
      to: '2021',
      current: false,
      desc: 'Built full-stack features for the core product using React and Node.js.',
    },
  ],
  education: [
    {
      school: 'University of California, Berkeley',
      degree: 'B.S.',
      field: 'Computer Science',
      from: '2014',
      to: '2018',
      gpa: '3.8',
    },
  ],
  certifications: [
    { name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', year: '2022' },
  ],
};

// ─── List Templates ───────────────────────────────────

export interface ListTemplatesOptions {
  category?: string;
  featured?: boolean;
  documentType?: string;
}

export const listTemplates = async (options: ListTemplatesOptions = {}) => {
  const { category, featured, documentType } = options;
  return prisma.resumeTemplate.findMany({
    where: {
      isActive: true,
      reviewStatus: 'APPROVED',
      ...(category && category !== 'ALL' ? { category: category as any } : {}),
      ...(documentType && documentType !== 'ALL' ? { documentType: documentType as any } : {}),
      ...(featured ? { isFeatured: true } : {}),
    },
    orderBy: featured
      ? [{ displayOrder: 'asc' }, { createdAt: 'asc' }]
      : [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      description: true,
      thumbnailUrl: true,
      htmlLayout: true,
      cssStyles: true,
      category: true,
      documentType: true,
      reviewStatus: true,
      customization: true,
      isCommunity: true,
      owner: { select: { name: true } },
      isDefault: true,
      isActive: true,
      isFeatured: true,
      displayOrder: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { resumes: true } },
    },
  });
};

// ─── Get Template By ID ───────────────────────────────

export const getTemplateById = async (id: string) => {
  const template = await prisma.resumeTemplate.findFirst({
    where: { id, isActive: true, reviewStatus: 'APPROVED' },
    include: { owner: { select: { name: true } } },
  });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');
  return { template, sampleData: SAMPLE_RESUME_DATA };
};

const CUSTOMIZATION_START = '/* profileai:user-customization:start */';
const CUSTOMIZATION_END = '/* profileai:user-customization:end */';

const stripCustomizationCss = (css: string) => {
  const start = css.indexOf(CUSTOMIZATION_START);
  if (start < 0) return css.trim();
  const end = css.indexOf(CUSTOMIZATION_END, start);
  if (end < 0) return css.slice(0, start).trim();
  return `${css.slice(0, start)}${css.slice(end + CUSTOMIZATION_END.length)}`.trim();
};

const fontStacks: Record<NonNullable<TemplateCustomizationInput['fontFamily']>, string> = {
  Inter: 'Inter, system-ui, sans-serif',
  'Source Sans 3': '"Source Sans 3", Inter, system-ui, sans-serif',
  'IBM Plex Sans': '"IBM Plex Sans", Inter, system-ui, sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
  Arial: 'Arial, "Helvetica Neue", sans-serif',
  Merriweather: 'Merriweather, Georgia, serif',
};

const customizationCss = (id: string, value: TemplateCustomizationInput) => {
  const selector = `.tpl.tpl-custom-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const density = value.spacing === 'compact' ? '.76' : value.spacing === 'airy' ? '1.24' : '1';
  const heading = value.headingStyle === 'title'
    ? 'text-transform:none;letter-spacing:.02em'
    : value.headingStyle === 'minimal'
      ? 'text-transform:none;letter-spacing:0;border-bottom-color:transparent'
      : 'text-transform:uppercase';
  const rules = [
    value.accentColor ? `--accent:${value.accentColor}` : '',
    value.fontFamily ? `font-family:${fontStacks[value.fontFamily]}` : '',
  ].filter(Boolean).join(';');
  return `${CUSTOMIZATION_START}
${selector}{${rules};--profile-density:${density}}
${selector} .tpl-section{margin-top:calc(1.25rem * var(--profile-density))}
${selector} .tpl-section-title{${heading}}
${selector} .tpl-job,${selector} .tpl-edu{margin-bottom:calc(.75rem * var(--profile-density))}
${CUSTOMIZATION_END}`;
};

const parseCustomization = (value: Prisma.JsonValue | null): TemplateCustomizationInput => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as TemplateCustomizationInput;
};

export const listUserTemplates = async (userId: string) =>
  prisma.resumeTemplate.findMany({
    where: { ownerId: userId },
    include: { _count: { select: { resumes: true } } },
    orderBy: { updatedAt: 'desc' },
  });

export const forkUserTemplate = async (userId: string, data: ForkUserTemplateInput) => {
  const source = await prisma.resumeTemplate.findFirst({
    where: {
      id: data.sourceTemplateId,
      isActive: true,
      OR: [
        { reviewStatus: 'APPROVED' },
        { ownerId: userId },
      ],
    },
  });
  if (!source) throw new AppError(status.NOT_FOUND, 'Source template is not available.');

  const customization = parseCustomization(source.customization);
  return prisma.resumeTemplate.create({
    data: {
      name: data.name?.trim() || `${source.name} — My version`,
      description: source.description,
      thumbnailUrl: source.thumbnailUrl,
      htmlLayout: source.htmlLayout,
      cssStyles: source.cssStyles,
      category: source.category,
      documentType: source.documentType,
      reviewStatus: 'DRAFT',
      ownerId: userId,
      sourceTemplateId: source.sourceTemplateId ?? source.id,
      customization: customization as Prisma.InputJsonValue,
      isCommunity: true,
      isActive: true,
      isDefault: false,
      isFeatured: false,
      displayOrder: 999,
      createdBy: userId,
    },
    include: { _count: { select: { resumes: true } } },
  });
};

export const updateUserTemplate = async (
  userId: string,
  id: string,
  data: UpdateUserTemplateInput,
) => {
  const current = await prisma.resumeTemplate.findFirst({ where: { id, ownerId: userId } });
  if (!current) throw new AppError(status.NOT_FOUND, 'Template not found in your gallery.');

  const nextCustomization = {
    ...parseCustomization(current.customization),
    ...(data.customization ?? {}),
  };
  const baseCss = stripCustomizationCss(current.cssStyles);
  const customClass = `tpl-custom-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const htmlLayout = current.htmlLayout.includes(customClass)
    ? current.htmlLayout
    : current.htmlLayout.replace('class="tpl ', `class="tpl ${customClass} `);
  return prisma.resumeTemplate.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.description !== undefined ? { description: data.description.trim() || null } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.documentType !== undefined ? { documentType: data.documentType } : {}),
      ...(data.customization !== undefined
        ? {
            customization: nextCustomization as Prisma.InputJsonValue,
            htmlLayout,
            cssStyles: `${baseCss}\n${customizationCss(id, nextCustomization)}`,
          }
        : {}),
      reviewStatus: 'DRAFT',
      rejectionReason: null,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      isFeatured: false,
    },
    include: { _count: { select: { resumes: true } } },
  });
};

export const submitUserTemplate = async (userId: string, id: string) => {
  const template = await prisma.resumeTemplate.findFirst({ where: { id, ownerId: userId } });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found in your gallery.');
  if (template.reviewStatus === 'PENDING') {
    throw new AppError(status.CONFLICT, 'This template is already awaiting review.');
  }
  if (!template.description?.trim()) {
    throw new AppError(status.BAD_REQUEST, 'Add a description before submitting.');
  }
  const updated = await prisma.resumeTemplate.update({
    where: { id },
    data: {
      reviewStatus: 'PENDING',
      submittedAt: new Date(),
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      isFeatured: false,
    },
  });
  await createRoleNotification('ADMIN', {
    type: 'SYSTEM',
    title: 'Template awaiting review',
    body: `${template.name} was submitted to the community gallery.`,
    link: '/admin/templates?reviewStatus=PENDING',
  });
  return updated;
};

export const deleteUserTemplate = async (userId: string, id: string) => {
  const template = await prisma.resumeTemplate.findFirst({
    where: { id, ownerId: userId },
    include: { _count: { select: { resumes: true } } },
  });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found in your gallery.');
  if (template._count.resumes > 0) {
    await prisma.resumeTemplate.update({ where: { id }, data: { isActive: false } });
    return { status: 'archived' as const };
  }
  await prisma.resumeTemplate.delete({ where: { id } });
  return { status: 'deleted' as const };
};

export const reviewUserTemplate = async (
  adminId: string,
  id: string,
  data: ReviewUserTemplateInput,
) => {
  const template = await prisma.resumeTemplate.findFirst({
    where: { id, ownerId: { not: null }, reviewStatus: 'PENDING' },
  });
  if (!template) throw new AppError(status.NOT_FOUND, 'Pending submission not found.');
  const updated = await prisma.resumeTemplate.update({
    where: { id },
    data: {
      reviewStatus: data.decision,
      rejectionReason: data.decision === 'REJECTED' ? data.reason!.trim() : null,
      reviewedAt: new Date(),
      reviewedBy: adminId,
      // Rejection removes the design from public eligibility, but the owner
      // can keep editing and using their private edition.
      isActive: true,
      isFeatured: false,
    },
  });
  await createNotification({
    userId: template.ownerId!,
    type: 'SYSTEM',
    title: data.decision === 'APPROVED' ? 'Template published' : 'Template needs changes',
    body: data.decision === 'APPROVED'
      ? `${template.name} is now live in the public template gallery.`
      : data.reason?.trim() || 'An administrator requested changes.',
    link: '/templates?view=mine',
  });
  return updated;
};

// ─── Create Template (Admin) ──────────────────────────

export const createTemplate = async (
  data: CreateTemplateInput,
  adminUserId: string,
  thumbnailFile?: Express.Multer.File
) => {
  let thumbnailUrl = data.thumbnailUrl || '';

  if (thumbnailFile) {
    const ext = thumbnailFile.originalname.split('.').pop() || 'png';
    const objectName = `templates/${Date.now()}.${ext}`;
    await uploadBuffer(objectName, thumbnailFile.buffer, thumbnailFile.mimetype);
    thumbnailUrl = await getPresignedUrl(objectName, 365 * 24 * 3600);
  }

  if (data.isDefault) {
    await prisma.resumeTemplate.updateMany({ data: { isDefault: false } });
  }

  return prisma.resumeTemplate.create({
    data: {
      name: data.name,
      ...(data.description !== undefined ? { description: data.description } : {}),
      thumbnailUrl,
      htmlLayout: data.htmlLayout,
      cssStyles: data.cssStyles,
      category: data.category as any,
      documentType: data.documentType as any,
      isActive: data.isActive ?? true,
      isDefault: data.isDefault ?? false,
      reviewStatus: 'APPROVED',
      createdBy: adminUserId,
    },
  });
};

// ─── Update Template (Admin) ──────────────────────────

export const updateTemplate = async (
  id: string,
  data: UpdateTemplateInput,
  thumbnailFile?: Express.Multer.File
) => {
  const existing = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Template not found.');

  let thumbnailUrl = existing.thumbnailUrl;
  if (thumbnailFile) {
    const ext = thumbnailFile.originalname.split('.').pop() || 'png';
    const objectName = `templates/${id}.${ext}`;
    await uploadBuffer(objectName, thumbnailFile.buffer, thumbnailFile.mimetype);
    thumbnailUrl = await getPresignedUrl(objectName, 365 * 24 * 3600);
  }

  if (data.isDefault) {
    await prisma.resumeTemplate.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
  }

  return prisma.resumeTemplate.update({
    where: { id },
    data: { ...(data as Prisma.ResumeTemplateUpdateInput), thumbnailUrl, category: data.category as any },
  });
};

// ─── Toggle Status (Admin) ────────────────────────────

export const toggleStatus = async (id: string) => {
  const template = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');
  return prisma.resumeTemplate.update({
    where: { id },
    data: { isActive: !template.isActive },
  });
};

// ─── Set Default (Admin) ──────────────────────────────

export const setDefault = async (id: string) => {
  const template = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');
  await prisma.resumeTemplate.updateMany({ data: { isDefault: false } });
  return prisma.resumeTemplate.update({ where: { id }, data: { isDefault: true } });
};

// ─── Delete Template (Admin) ──────────────────────────

export const deleteTemplate = async (id: string) => {
  const template = await prisma.resumeTemplate.findUnique({
    where: { id },
    include: { _count: { select: { resumes: true } } },
  });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');
  if (template._count.resumes > 0) {
    throw new AppError(
      status.CONFLICT,
      `Cannot delete template — ${template._count.resumes} resume(s) are using it.`
    );
  }
  await prisma.resumeTemplate.delete({ where: { id } });
  return { message: 'Template deleted successfully.' };
};
