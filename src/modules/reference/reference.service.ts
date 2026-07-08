import status from 'http-status';
import { Prisma } from '../../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { CreateReferenceInput, UpdateReferenceInput } from './reference.schema';

export const listReferences = async (userId: string) => {
  return prisma.reference.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
};

export const getReference = async (userId: string, id: string) => {
  const item = await prisma.reference.findFirst({ where: { id, userId } });
  if (!item) throw new AppError(status.NOT_FOUND, 'Reference not found.');
  return item;
};

export const createReference = async (userId: string, input: CreateReferenceInput) => {
  const data: Prisma.ReferenceUncheckedCreateInput = {
    userId,
    name: input.name,
    relationship: input.relationship,
    email: input.email && input.email !== '' ? input.email : null,
  };
  if (input.company !== undefined) data.company = input.company;
  if (input.phone !== undefined) data.phone = input.phone;
  return prisma.reference.create({ data });
};

export const updateReference = async (userId: string, id: string, input: UpdateReferenceInput) => {
  const existing = await prisma.reference.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Reference not found.');

  const data: Prisma.ReferenceUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.relationship !== undefined) data.relationship = input.relationship;
  if (input.company !== undefined) data.company = input.company;
  if (input.email !== undefined) data.email = input.email === '' ? null : input.email;
  if (input.phone !== undefined) data.phone = input.phone;

  return prisma.reference.update({ where: { id }, data });
};

export const deleteReference = async (userId: string, id: string) => {
  const existing = await prisma.reference.findFirst({ where: { id, userId } });
  if (!existing) throw new AppError(status.NOT_FOUND, 'Reference not found.');
  await prisma.reference.delete({ where: { id } });
  return { id };
};
