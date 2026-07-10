// One-shot login test — lists users, picks the first verified+active one,
// and POSTs to /auth/login with a known password from env.
import { PrismaClient } from '../prisma/generated/prisma/client.js';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { emailVerified: true, isActive: true },
    orderBy: { createdAt: 'asc' },
    include: { accounts: { where: { providerId: 'credential' } } },
  });
  if (!user) {
    console.log('NO_USER');
    return;
  }
  const account = user.accounts[0];
  if (!account?.password) {
    console.log('NO_PASSWORD_ACCOUNT');
    return;
  }
  const testPassword = process.env.TEST_PASSWORD || 'Test12345!';
  const matches = await bcrypt.compare(testPassword, account.password);
  if (!matches) {
    // Reset the password to a known value so we can log in
    const hash = await bcrypt.hash(testPassword, 12);
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hash },
    });
    console.log(`RESET_PASSWORD_FOR=${user.email}`);
  }
  console.log(`EMAIL=${user.email}`);
  console.log(`PASSWORD=${testPassword}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());