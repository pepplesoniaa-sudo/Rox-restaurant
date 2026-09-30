// Configuration for the Prisma CLI (migrate, generate, db seed).
// Prisma 7 no longer reads .env by itself, so load it here with Node's
// built-in loader. In production there is no .env file (the host injects
// real environment variables), which is why a missing file is ignored.
import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on variables already in the environment
}

// Migrations need a direct connection: they take a session-level lock,
// which a transaction-mode pooler (Neon's PgBouncer) cannot hold. When
// DIRECT_DATABASE_URL is set (production) the CLI uses it; locally there
// is no pooler, so DATABASE_URL alone is enough.
const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Only commands that talk to the database (migrate, db) need a URL.
  // `prisma generate` just writes TypeScript and must work without one:
  // it runs during `npm install` on the build server, where the database
  // URL may not be available. (Requiring it here broke the first Render build.)
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
