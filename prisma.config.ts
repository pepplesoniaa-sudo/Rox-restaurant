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
const urlVariable = process.env.DIRECT_DATABASE_URL ? 'DIRECT_DATABASE_URL' : 'DATABASE_URL';
const databaseUrl = process.env[urlVariable];

// Catch the common copy-paste mistakes (quotes, a leading "psql '", the
// variable name, a space) with a message that names the variable, instead
// of Prisma's generic "scheme is not recognized". Never print the value
// itself: it contains the database password.
if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
  throw new Error(
    `${urlVariable} must start with postgresql:// . Check it has no quotes, no leading "psql '", ` +
      `no "${urlVariable}=" prefix and no spaces (value starts with "${databaseUrl.slice(0, 6)}...").`,
  );
}

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
