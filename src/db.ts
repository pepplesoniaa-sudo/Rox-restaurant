import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.js';
import { PrismaClient } from './generated/prisma/client.js';

// One shared client for the whole process. Prisma 7 talks to Postgres through
// a driver adapter; PrismaPg uses the standard "pg" driver and its connection pool.
const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const prisma = new PrismaClient({ adapter });
