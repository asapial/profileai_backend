import bcrypt from 'bcryptjs';
import status from 'http-status';
import { Prisma } from '../../prisma/generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { uploadBuffer, getPresignedUrl, deleteObject } from '../../lib/minio';
import AppError from '../../errorHelpers/AppError';
import { ChangePasswordInput, UpdateProfileInput } from './user.schema';

// ─── Get Profile ──────────────────────────────────────

export const getProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      role: true,
      twoFactorEnabled: true,
      createdAt: true,
      profile: true,
      limits: true,
    },
  });

  if (!user) throw new AppError(status.NOT_FOUND, 'User not found.');

  // Compute profile completion percentage
  const profile = user.profile;
  const completionFields = [
    profile?.firstName,
    profile?.lastName,
    profile?.phone,
    profile?.headline,
    profile?.bio,
    profile?.location,
    profile?.website,
    profile?.linkedIn,
    profile?.avatarUrl,
    profile?.skills?.length ? true : null,
    Array.isArray(profile?.education) && (profile.education as unknown[]).length > 0 ? true : null,
    Array.isArray(profile?.experience) && (profile.experience as unknown[]).length > 0 ? true : null,
  ];
  const completedCount = completionFields.filter(Boolean).length;
  const completionPercentage = Math.round((completedCount / completionFields.length) * 100);

  return { ...user, completionPercentage };
};

// ─── Update Profile ───────────────────────────────────

export const updateProfile = async (userId: string, data: UpdateProfileInput) => {
  const { firstName, lastName, ...rest } = data;

  const updateData: Record<string, unknown> = { ...rest };
  if (firstName || lastName) {
    const current = await prisma.userProfile.findUnique({ where: { userId } });
    updateData.firstName = firstName || current?.firstName;
    updateData.lastName = lastName || current?.lastName;
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      firstName: firstName || '',
      lastName: lastName || '',
      education: [] as unknown as Prisma.InputJsonValue,
      experience: [] as unknown as Prisma.InputJsonValue,
      skills: [] as unknown as Prisma.InputJsonValue,
      languages: [] as unknown as Prisma.InputJsonValue,
      ...rest,
    },
  });

  // Update display name on user record
  if (firstName || lastName) {
    await prisma.user.update({
      where: { id: userId },
      data: { name: `${profile.firstName} ${profile.lastName}` },
    });
  }

  return profile;
};

// ─── Avatar Upload ────────────────────────────────────

export const uploadAvatar = async (
  userId: string,
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<string> => {
  const ext = originalname.split('.').pop() || 'jpg';
  const objectName = `avatars/${userId}/avatar.${ext}`;

  const readable: Buffer = buffer;
  await uploadBuffer(objectName, readable, mimetype);

  const presignedUrl = await getPresignedUrl(objectName, 7 * 24 * 3600); // 7 days

  await prisma.userProfile.upsert({
    where: { userId },
    update: { avatarUrl: presignedUrl },
    create: {
      userId,
      firstName: '',
      lastName: '',
      education: [] as unknown as Prisma.InputJsonValue,
      experience: [] as unknown as Prisma.InputJsonValue,
      skills: [] as unknown as Prisma.InputJsonValue,
      languages: [] as unknown as Prisma.InputJsonValue,
      avatarUrl: presignedUrl,
    },
  });

  return presignedUrl;
};

// ─── Change Password ──────────────────────────────────

export const changePassword = async (userId: string, data: ChangePasswordInput) => {
  const { currentPassword, newPassword } = data;

  const account = await prisma.account.findFirst({
    where: { userId, providerId: 'credential' },
  });

  if (!account?.password) {
    throw new AppError(status.BAD_REQUEST, 'No password set for this account.');
  }

  const isValid = await bcrypt.compare(currentPassword, account.password);
  if (!isValid) throw new AppError(status.UNAUTHORIZED, 'Current password is incorrect.');

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.account.update({
    where: { id: account.id },
    data: { password: newHash },
  });

  return { message: 'Password changed successfully.' };
};

// ─── Devices ──────────────────────────────────────────

export const getDevices = async (userId: string, currentSessionToken: string) => {
  const devices = await prisma.loginDevice.findMany({
    where: { userId },
    orderBy: { lastSeenAt: 'desc' },
    include: {
      sessions: {
        where: { token: currentSessionToken },
        select: { id: true },
      },
    },
  });

  return devices.map((d) => ({
    id: d.id,
    deviceName: d.deviceName,
    deviceType: d.deviceType,
    browser: d.browser,
    os: d.os,
    ipAddress: d.ipAddress,
    lastSeenAt: d.lastSeenAt,
    isTrusted: d.isTrusted,
    isCurrentDevice: d.sessions.length > 0,
  }));
};

export const revokeDevice = async (userId: string, deviceId: string) => {
  const device = await prisma.loginDevice.findFirst({
    where: { id: deviceId, userId },
  });

  if (!device) throw new AppError(status.NOT_FOUND, 'Device not found.');

  // Delete all sessions for this device, then delete the device
  await prisma.session.deleteMany({ where: { deviceId } });
  await prisma.loginDevice.delete({ where: { id: deviceId } });

  return { message: 'Device revoked successfully.' };
};

// ─── Limits ───────────────────────────────────────────

export const getUserLimits = async (userId: string) => {
  const limits = await prisma.userLimit.findUnique({ where: { userId } });
  if (!limits) throw new AppError(status.NOT_FOUND, 'User limits not found.');
  return limits;
};
