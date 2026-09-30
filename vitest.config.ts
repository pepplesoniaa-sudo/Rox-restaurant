import { defineConfig } from 'vitest/config';

// Read .env so TEST_DATABASE_URL is available here (a missing file is fine).
try {
  process.loadEnvFile();
} catch {
  // rely on variables already in the environment (e.g. CI)
}

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/rox_restaurant_test';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Recreates, migrates and seeds the test database once before all tests.
    globalSetup: ['tests/global-setup.ts'],
    // Every test file sees the test database, never the dev one. The rate
    // limit is raised so tests that send many requests are not throttled;
    // the rate limit test builds its own app with a tiny limit.
    env: {
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: 'test',
      RATE_LIMIT_MAX_REQUESTS: '100000',
      CORS_ALLOWED_ORIGINS: 'https://consumer.example.test',
    },
    // Test files share one database, so run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
