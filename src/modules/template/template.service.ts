import status from 'http-status';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { uploadBuffer, getPresignedUrl } from '../../lib/minio';
import AppError from '../../errorHelpers/AppError';
import { CreateTemplateInput, UpdateTemplateInput } from './template.schema';

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
}

export const listTemplates = async (options: ListTemplatesOptions = {}) => {
  const { category, featured } = options;
  return prisma.resumeTemplate.findMany({
    where: {
      isActive: true,
      ...(category && category !== 'ALL' ? { category: category as any } : {}),
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
      category: true,
      isDefault: true,
      isActive: true,
      isFeatured: true,
      displayOrder: true,
      _count: { select: { resumes: true } },
    },
  });
};

// ─── Get Template By ID ───────────────────────────────

export const getTemplateById = async (id: string) => {
  const template = await prisma.resumeTemplate.findUnique({ where: { id } });
  if (!template) throw new AppError(status.NOT_FOUND, 'Template not found.');
  return { template, sampleData: SAMPLE_RESUME_DATA };
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
      isActive: data.isActive ?? true,
      isDefault: data.isDefault ?? false,
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
