// Provision a known user+password for end-to-end login testing.
import { PrismaClient } from '../prisma/generated/prisma/client.js';
import bcrypt from 'bcryptjs';
const p = new PrismaClient();

const TEST_EMAIL = 'heptex.project4@gmail.com';
const TEST_PASSWORD = 'Test12345!';

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
