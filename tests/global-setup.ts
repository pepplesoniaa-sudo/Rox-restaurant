// Runs once before the whole test suite: builds a fresh, seeded, throwaway
// database so every run starts from the same known state.
import { execSync } from 'node:child_process';
import pg from 'pg';

const SEED_SIZE = { SEED_RESTAURANTS: '20', SEED_CUSTOMERS: '30', SEED_ORDERS: '40' };

export default async function setup() {
  const testUrl = new URL(
    process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/rox_restaurant_test',
  );
  const databaseName = testUrl.pathname.slice(1);

  // Safety catch: this function DROPS the database. Refuse to touch anything
  // whose name does not say it is for tests, so a mistake in .env can never
  // wipe development or production data.
  if (!/^[a-z0-9_]+_test$/.test(databaseName)) {
    throw new Error(`Refusing to reset "${databaseName}": the test database name must end in _test`);
  }

  // Connect to the server's default "postgres" database to drop/create ours.
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    // WITH (FORCE) disconnects any leftover sessions from a previous run.
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await admin.end();
  }

  // Same migrations and seed script as production, pointed at the test DB.
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), ...SEED_SIZE };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  execSync('npx tsx scripts/seed.ts', { env, stdio: 'ignore' });
}
