// Provision a known user+password for end-to-end login testing.
import 'dotenv/config';
import { PrismaClient } from '../prisma/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
const p = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TEST_EMAIL = process.env.SEED_USER_EMAIL;
const TEST_PASSWORD = process.env.SEED_USER_PASSWORD;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD are required.');
}

const user = await p.user.findUnique({
  where: { email: TEST_EMAIL },
  include: { accounts: { where: { providerId: 'credential' } } },
});
if (!user) {
  console.log('NO_USER');
  process.exit(0);
}
console.log(`FOUND user id=${user.id} verified=${user.emailVerified} active=${user.isActive} 2fa=${user.twoFactorEnabled}`);
const acc = user.accounts[0];
if (acc) {
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);
  await p.account.update({ where: { id: acc.id }, data: { password: hash } });
  console.log('PASSWORD_RESET');
} else {
  // create credential account row
  await p.account.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: await bcrypt.hash(TEST_PASSWORD, 12),
    },
  });
  console.log('ACCOUNT_CREATED');
}
await p.$disconnect();
