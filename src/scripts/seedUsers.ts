import "dotenv/config";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";

import { prisma } from "../lib/prisma";

const PASSWORD_SALT_ROUNDS = 12;

const seedAccounts = [
  {
    name: "Heptex Admin",
    email: "heptex.project1@gmail.com",
    password: "As31311421%",
    role: "ADMIN" as const,
  },
  {
    name: "Heptex Customer",
    email: "heptex.project3@gmail.com",
    password: "As31311421%",
    role: "USER" as const,
  },
];

const upsertCredentialAccount = async (
  userId: string,
  passwordHash: string,
) => {
  const credentialAccount = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });

  if (credentialAccount) {
    await prisma.account.update({
      where: { id: credentialAccount.id },
      data: { accountId: userId, password: passwordHash },
    });
    return;
  }

  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    },
  });
};

const seedAccount = async (account: (typeof seedAccounts)[number]) => {
  const email = account.email.toLowerCase();
  const passwordHash = await bcrypt.hash(
    account.password,
    PASSWORD_SALT_ROUNDS,
  );

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id: crypto.randomUUID(),
      name: account.name,
      email,
      emailVerified: true,
      isActive: true,
      role: account.role,
      twoFactorEnabled: false,
    },
    update: {
      name: account.name,
      emailVerified: true,
      isActive: true,
      role: account.role,
      twoFactorEnabled: false,
      twoFactorSecret: null,
    },
  });

  await upsertCredentialAccount(user.id, passwordHash);

  if (account.role === "ADMIN") {
    await prisma.adminProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        firstName: "Heptex",
        lastName: "Admin",
        department: "Administration",
        permissions: ["*"],
      },
      update: {
        firstName: "Heptex",
        lastName: "Admin",
        department: "Administration",
        permissions: ["*"],
      },
    });
  } else {
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        firstName: "Heptex",
        lastName: "Customer",
        skills: [],
        languages: [],
        education: [],
        experience: [],
      },
      update: {
        firstName: "Heptex",
        lastName: "Customer",
      },
    });

    await prisma.userLimit.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        resumeLimit: 5,
        apiLimit: 50,
        resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {},
    });

    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  await prisma.session.deleteMany({ where: { userId: user.id } });

  return { email: user.email, role: user.role };
};

try {
  const seededAccounts = [];

  for (const account of seedAccounts) {
    seededAccounts.push(await seedAccount(account));
  }

  console.log("Seeded login accounts:", seededAccounts);
} finally {
  await prisma.$disconnect();
}
