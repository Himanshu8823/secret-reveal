import { PrismaClient } from '@prisma/client';

// Singleton — Prisma's client is designed to be reused across the process.
// Hot-reload in dev can otherwise create connection-pool exhaustion.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
