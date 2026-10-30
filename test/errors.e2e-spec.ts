import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options.js';
import { polygon, square } from './geo-fixtures.js';
import { createTestApp, resetDatabase } from './test-app.js';

const cursor = (raw: string) => Buffer.from(raw).toString('base64url');
const recent = () => new Date(Date.now() - 1_000).toISOString();

// Inputs that pass a naive check but used to fail inside PostgreSQL with 500.
describe('Invalid input never reaches the database (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['areaId above the integer range', { areaId: '2147483648' }],
    [
      'cursor id above the bigint range',
      { cursor: cursor('2026-01-01T00:00:00.000Z|9999999999999999999') },
    ],
    [
      'cursor date outside the timestamp range',
      { cursor: cursor('-271821-04-20T00:00:00.000Z|1') },
    ],
    ['userId with a NUL character', { userId: 'a\u0000b' }],
  ])('GET /logs: %s → 400', async (_label, query) => {
    await http().get('/logs').query(query).expect(400);
  });

  it('POST /locations: userId with a NUL character → 400', async () => {
    await http()
      .post('/locations')
      .send({
        userId: 'a\u0000b',
        latitude: 41,
        longitude: 29,
        timestamp: recent(),
      })
      .expect(400);
  });

  it('POST /areas: name with a NUL character or only spaces → 400', async () => {
    const shape = polygon(square(29.0, 41.0, 0.1));
    await http()
      .post('/areas')
      .send({ name: 'a\u0000b', polygon: shape })
      .expect(400);
    await http()
      .post('/areas')
      .send({ name: '   ', polygon: shape })
      .expect(400);
  });
});

// Uses its own throwaway database so it can be stopped mid-test.
describe('Database unavailable (e2e)', () => {
  it('answers 503 instead of 500', async () => {
    const container = await new PostgreSqlContainer(
      'imresamu/postgis:17-3.5',
    ).start();
    const dbEnv = {
      DB_HOST: container.getHost(),
      DB_PORT: String(container.getPort()),
      DB_USER: container.getUsername(),
      DB_PASSWORD: container.getPassword(),
      DB_NAME: container.getDatabase(),
    };
    const migrator = new DataSource(buildDataSourceOptions(dbEnv));
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();

    const app = await createTestApp(dbEnv);
    try {
      await container.stop();

      const location = await request(app.getHttpServer())
        .post('/locations')
        .send({
          userId: 'u1',
          latitude: 41,
          longitude: 29,
          timestamp: recent(),
        });
      expect(location.status).toBe(503);

      const logs = await request(app.getHttpServer()).get('/logs');
      expect(logs.status).toBe(503);

      const health = await request(app.getHttpServer()).get('/health');
      expect(health.status).toBe(503);
    } finally {
      await app.close().catch(() => undefined);
    }
  });
});
