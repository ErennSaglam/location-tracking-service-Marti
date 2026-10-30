import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { buildDataSourceOptions } from '../src/database/data-source-options.js';

declare module 'vitest' {
  export interface ProvidedContext {
    dbEnv: Record<string, string>;
  }
}

// Created only in the throwaway container; resetDatabase() requires it.
export const E2E_MARKER_TABLE = 'e2e_test_marker';

let container: StartedPostgreSqlContainer;

// One throwaway PostGIS container per e2e run, migrated once.
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('imresamu/postgis:17-3.5').start();
  const dbEnv = {
    DB_HOST: container.getHost(),
    DB_PORT: String(container.getPort()),
    DB_USER: container.getUsername(),
    DB_PASSWORD: container.getPassword(),
    DB_NAME: container.getDatabase(),
  };

  const dataSource = new DataSource(buildDataSourceOptions(dbEnv));
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.query(`CREATE TABLE ${E2E_MARKER_TABLE} ()`);
  await dataSource.destroy();

  project.provide('dbEnv', dbEnv);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
