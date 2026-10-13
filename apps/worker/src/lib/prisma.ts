import { PrismaClient } from "@prisma/client";

/** One database client for all of the worker's jobs. */
export const prisma = new PrismaClient();
