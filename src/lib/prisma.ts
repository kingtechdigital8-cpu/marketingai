import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient();
}

export let prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Discards the current PrismaClient instance and replaces it with a brand new
 * one. Used when the existing client's connection has gotten into a state
 * that plain $disconnect()/$connect() on the same instance can't recover from.
 */
export async function resetPrismaClient(): Promise<void> {
  await prisma.$disconnect().catch(() => {});
  prisma = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }
}
