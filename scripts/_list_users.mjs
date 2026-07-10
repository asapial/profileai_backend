import { PrismaClient } from '../prisma/generated/prisma/client.js';
const p = new PrismaClient();
const users = await p.user.findMany({
  orderBy: { createdAt: 'asc' },
  take: 10,
  select: {
    id: true, email: true, emailVerified: true, isActive: true,
    twoFactorEnabled: true,
    accounts: {
      where: { providerId: 'credential' },
      select: { id: true, password: true },
    },
  },
});
for (const u of users) {
  const hasPw = Boolean(u.accounts[0]?.password);
  console.log(`${u.email}\tverified=${u.emailVerified}\tactive=${u.isActive}\t2fa=${u.twoFactorEnabled}\thasPw=${hasPw}`);
}
await p.$disconnect();