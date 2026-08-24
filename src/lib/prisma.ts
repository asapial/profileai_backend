import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../prisma/generated/prisma/client';

const rawConnectionString = `${process.env.DATABASE_URL}`;
const connectionUrl = new URL(rawConnectionString);
if (
  ["prefer", "require", "verify-ca"].includes(
    connectionUrl.searchParams.get("sslmode") ?? "",
  )
) {
  connectionUrl.searchParams.set("sslmode", "verify-full");
}
const connectionString = connectionUrl.toString();

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
