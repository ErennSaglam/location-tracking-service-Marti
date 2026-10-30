import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { polygon, square } from './geo-fixtures.js';
import { createTestApp, resetDatabase } from './test-app.js';

interface LogBody {
  id: string;
  userId: string;
  areaId: number;
  entryTime: string;
}

describe('Logs (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);

    for (const name of ['A', 'B']) {
      await http()
        .post('/areas')
        .send({ name, polygon: polygon(square(29.0, 41.0, 0.1)) })
        .expect(201);
    }
    // 2 users x 2 areas x 3 entries; two rows share each entry_time so the
    // id tie-breaker in the cursor is exercised.
    await app.get(DataSource).query(`
      INSERT INTO area_entry_logs (user_id, area_id, entry_time)
      SELECT u, a, timestamptz '2026-01-01 09:00:00+00' + make_interval(mins => m)
      FROM unnest(ARRAY['u1', 'u2']) AS u,
           unnest(ARRAY[1, 2]) AS a,
           generate_series(1, 3) AS m
    `);
  });

  afterAll(async () => {
    await app.close();
  });

  const fetchAll = async (params: Record<string, string | number>) => {
    const items: LogBody[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await http()
        .get('/logs')
        .query({ ...params, ...(cursor ? { cursor } : {}) })
        .expect(200);
      items.push(...res.body.data);
      cursor = res.body.nextCursor;
    } while (cursor);
    return items;
  };

  it('pages through all logs newest first without gaps or duplicates', async () => {
    const items = await fetchAll({ limit: 5 });

    expect(items).toHaveLength(12);
    expect(new Set(items.map((i) => i.id)).size).toBe(12);
    const order = items.map((i) => [i.entryTime, BigInt(i.id)] as const);
    for (let i = 1; i < order.length; i++) {
      const [prevTime, prevId] = order[i - 1];
      const [time, id] = order[i];
      expect(prevTime > time || (prevTime === time && prevId > id)).toBe(true);
    }
    expect(Object.keys(items[0]).sort()).toEqual([
      'areaId',
      'entryTime',
      'id',
      'userId',
    ]);
  });

  it('filters by userId and areaId', async () => {
    const items = await fetchAll({ userId: 'u1', areaId: 2, limit: 2 });

    expect(items).toHaveLength(3);
    expect(items.every((i) => i.userId === 'u1' && i.areaId === 2)).toBe(true);
  });

  it('rejects invalid query parameters', async () => {
    await http().get('/logs').query({ limit: 0 }).expect(400);
    await http().get('/logs').query({ limit: 101 }).expect(400);
    await http().get('/logs').query({ areaId: 'x' }).expect(400);
    await http().get('/logs').query({ cursor: 'not-a-cursor' }).expect(400);
  });
});
