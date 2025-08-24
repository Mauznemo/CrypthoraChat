import { PrismaClient } from '../generated/prisma/client';
import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const db =
	globalForPrisma.prisma ??
	new PrismaClient({
		datasources: {
			db: {
				url: databaseUrl
			}
		}
	});

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = db;
}
