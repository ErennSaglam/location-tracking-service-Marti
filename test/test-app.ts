import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { E2E_MARKER_TABLE } from './global-setup.js';

// Connects to the shared e2e database, or to `dbEnv` when a test brings its own.
export async function createTestApp(
  dbEnv: Record<string, string> = inject('dbEnv'),
): Promise<INestApplication> {
  if (!dbEnv) {
    throw new Error(
      'No test database provided. Run e2e tests with `npm run test:e2e`.',
    );
  }
  // Real env vars take precedence over .env in ConfigModule.
  Object.assign(process.env, dbEnv);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

// Refuses to wipe any database that global-setup did not create: dev and
// production databases never contain the marker table.
export async function resetDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const [{ marker }] = await dataSource.query<{ marker: string | null }[]>(
    `SELECT to_regclass('public.${E2E_MARKER_TABLE}') AS marker`,
  );
  if (marker === null) {
    throw new Error(
      `Refusing to truncate: "${E2E_MARKER_TABLE}" not found, this is not the e2e test database`,
    );
  }
  await dataSource.query(
    'TRUNCATE area_entry_logs, user_location_states, areas RESTART IDENTITY CASCADE',
  );
}
