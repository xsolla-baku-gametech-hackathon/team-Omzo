import { PrismaClient } from "@prisma/client";

/**
 * One Prisma client per process.
 *
 * Next's dev server reloads modules on every edit, and a fresh PrismaClient
 * per reload exhausts the connection pool within a few saves. The global is
 * the documented way out and is confined to development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
