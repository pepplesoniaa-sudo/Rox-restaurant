import { z } from 'zod';

// The single home for every tunable number in the app.
// Values come from environment variables; each has a safe default so a
// missing variable never crashes a request handler at runtime.
// If a variable is present but invalid (e.g. RATE_LIMIT_MAX_REQUESTS=abc),
// the process refuses to start, which is better than running misconfigured.

const commaSeparatedList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // Must start with postgresql:// (or postgres://). The message never echoes
    // the value, because it contains the database password.
    DATABASE_URL: z
      .string({ error: 'is required' })
      .regex(/^postgres(ql)?:\/\/\S+$/, {
        error: 'must start with postgresql:// and contain no quotes or spaces (was a "psql" command or quotes pasted?)',
      }),

    PAGINATION_DEFAULT_LIMIT: z.coerce.number().int().positive().default(20),
    PAGINATION_MAX_LIMIT: z.coerce.number().int().positive().default(100),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

    CORS_ALLOWED_ORIGINS: commaSeparatedList,

    ORDER_MAX_LINES: z.coerce.number().int().positive().default(20),
    ORDER_MAX_QUANTITY_PER_LINE: z.coerce.number().int().positive().default(99),
    ORDER_REFERENCE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

    JSON_BODY_LIMIT: z.string().regex(/^\d+(b|kb|mb)$/, { error: 'must look like 100kb' }).default('100kb'),

    SEED_RESTAURANTS: z.coerce.number().int().positive().default(300),
    SEED_CUSTOMERS: z.coerce.number().int().positive().default(500),
    SEED_ORDERS: z.coerce.number().int().positive().default(800),
  })
  .refine((env) => env.PAGINATION_DEFAULT_LIMIT <= env.PAGINATION_MAX_LIMIT, {
    message: 'PAGINATION_DEFAULT_LIMIT cannot be larger than PAGINATION_MAX_LIMIT',
    path: ['PAGINATION_DEFAULT_LIMIT'],
  });

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  const env = parsed.data;

  // Grouped so call sites read naturally: config.pagination.maxLimit
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    pagination: {
      defaultLimit: env.PAGINATION_DEFAULT_LIMIT,
      maxLimit: env.PAGINATION_MAX_LIMIT,
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
    trustProxyHops: env.TRUST_PROXY_HOPS,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    orders: {
      maxLines: env.ORDER_MAX_LINES,
      maxQuantityPerLine: env.ORDER_MAX_QUANTITY_PER_LINE,
      referenceMaxAttempts: env.ORDER_REFERENCE_MAX_ATTEMPTS,
    },
    jsonBodyLimit: env.JSON_BODY_LIMIT,
    seed: {
      restaurants: env.SEED_RESTAURANTS,
      customers: env.SEED_CUSTOMERS,
      orders: env.SEED_ORDERS,
    },
  } as const;
}

export const config = loadConfig();
export type Config = typeof config;
