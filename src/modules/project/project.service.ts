import status from 'http-status';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { CreateProjectInput, UpdateProjectInput } from './project.schema';

export const listProjects = async (userId: string) => {
  return prisma.project.findMany({
    where: { userId },
    orderBy: [{ current: 'desc' }, { createdAt: 'desc' }],
  });
};

export const getProject = async (userId: string, id: string) => {
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) throw new AppError(status.NOT_FOUND, 'Project not found.');
  return project;
};

export const createProject = async (userId: string, input: CreateProjectInput) => {
  const data: Prisma.ProjectUncheckedCreateInput = {
    userId,
    title: input.title,
    techStack: input.techStack ?? [],
    url: input.url && input.url !== '' ? input.url : null,
    repoUrl: input.repoUrl && input.repoUrl !== '' ? input.repoUrl : null,
    current: input.current ?? false,
  };
  if (input.description !== undefined) data.description = input.description;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.endDate !== undefined) data.endDate = input.endDate;
  return prisma.project.create({ data });
};

export const updateProject = async (userId: string, id: string, input: UpdateProjectInput) => {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Project not found.');

  const data: Prisma.ProjectUpdateInput = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.techStack !== undefined) data.techStack = input.techStack;
  if (input.url !== undefined) data.url = input.url === '' ? null : input.url;
  if (input.repoUrl !== undefined) data.repoUrl = input.repoUrl === '' ? null : input.repoUrl;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.endDate !== undefined) data.endDate = input.endDate;
  if (input.current !== undefined) data.current = input.current;

  return prisma.project.update({ where: { id }, data });
};

export const deleteProject = async (userId: string, id: string) => {
  const existing = await prisma.project.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Project not found.');
  await prisma.project.delete({ where: { id } });
  return { id };
};
