import type { DataSourceOptions } from 'typeorm';
import { InitialSchema1792916810000 } from './migrations/1792916810000-InitialSchema.js';

type Env = Record<string, string | undefined>;

// Single source of truth for connection settings, shared by the Nest app
// (DatabaseModule) and the TypeORM CLI (data-source.ts).
export function buildDataSourceOptions(env: Env): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST ?? 'localhost',
    port: Number(env.DB_PORT ?? 5440),
    username: env.DB_USER ?? 'location',
    password: env.DB_PASSWORD ?? 'location',
    database: env.DB_NAME ?? 'location_tracking',
    // Schema changes only go through migrations, never through synchronize.
    synchronize: false,
    migrationsRun: false,
    // Registered explicitly instead of a glob so the same list works from
    // dist/ (CLI, production) and from TypeScript sources (Vitest).
    migrations: [InitialSchema1792916810000],
    migrationsTableName: 'typeorm_migrations',
    extra: {
      max: Number(env.DB_POOL_SIZE ?? 20),
    },
  };
}
