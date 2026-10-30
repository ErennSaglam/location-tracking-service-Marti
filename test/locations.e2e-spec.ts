import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { polygon, square } from './geo-fixtures.js';
import { createTestApp, resetDatabase } from './test-app.js';

// Area layout (lon/lat):
//   Outer       29.00–29.10 / 41.00–41.10
//   Inner       29.02–29.04 / 41.02–41.04  (inside Outer)
//   Overlapping 29.05–29.15 / 41.05–41.15  (half over Outer)
const OUTSIDE = { latitude: 40.5, longitude: 28.5 };
const OUTER_ONLY = { latitude: 41.01, longitude: 29.01 };
const INNER = { latitude: 41.03, longitude: 29.03 };
const OUTER_AND_OVERLAP = { latitude: 41.07, longitude: 29.07 };

const at = (second: number) =>
  new Date(Date.UTC(2026, 0, 1, 9, 0, second)).toISOString();

describe('Locations (e2e)', () => {
  let app: INestApplication<App>;
  let areaIds: { outer: number; inner: number; overlapping: number };
  const http = () => request(app.getHttpServer());

  const send = (userId: string, point: object, second: number) =>
    http()
      .post('/locations')
      .send({ userId, ...point, timestamp: at(second) });

  const logsOf = (userId: string) =>
    app
      .get(DataSource)
      .query<{ area_id: number; entry_time: Date }[]>(
        `SELECT area_id, entry_time FROM area_entry_logs
         WHERE user_id = $1 ORDER BY entry_time, area_id`,
        [userId],
      );

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    const create = async (name: string, coords: unknown) =>
      (
        await http()
          .post('/areas')
          .send({ name, polygon: polygon(coords) })
          .expect(201)
      ).body.id as number;
    areaIds = {
      outer: await create('Outer', square(29.0, 41.0, 0.1)),
      inner: await create('Inner', square(29.02, 41.02, 0.02)),
      overlapping: await create('Overlapping', square(29.05, 41.05, 0.1)),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs only new entries while a user moves through nested and overlapping areas', async () => {
    const { outer, inner, overlapping } = areaIds;
    const steps: [object, number, number[]][] = [
      // point, second, expected enteredAreaIds
      [OUTSIDE, 0, []],
      [OUTER_ONLY, 5, [outer]], // first entry
      [OUTER_ONLY, 10, []], // staying inside: no new log
      [INNER, 15, [inner]], // nested: Outer stays, only Inner is new
      [OUTER_AND_OVERLAP, 20, [overlapping]], // left Inner, entered Overlapping
      [OUTSIDE, 25, []], // left everything
      [OUTER_ONLY, 30, [outer]], // re-entry creates a new log
    ];

    for (const [point, second, expected] of steps) {
      const res = await send('u1', point, second).expect(200);
      expect(res.body.status).toBe('processed');
      expect(res.body.enteredAreaIds).toEqual(expected);
    }

    expect(await logsOf('u1')).toEqual([
      { area_id: outer, entry_time: new Date(at(5)) },
      { area_id: inner, entry_time: new Date(at(15)) },
      { area_id: overlapping, entry_time: new Date(at(20)) },
      { area_id: outer, entry_time: new Date(at(30)) },
    ]);
  });

  it('ignores stale and duplicate updates and rejects conflicting ones', async () => {
    await send('u1', OUTER_ONLY, 10).expect(200);

    const duplicate = await send('u1', OUTER_ONLY, 10).expect(200);
    expect(duplicate.body.status).toBe('duplicate_ignored');

    // Older than the last processed update: must not move the user back.
    const stale = await send('u1', INNER, 5).expect(200);
    expect(stale.body).toMatchObject({
      status: 'stale_ignored',
      currentAreaIds: [areaIds.outer],
    });

    await send('u1', INNER, 10).expect(409);

    expect(await logsOf('u1')).toHaveLength(1);
  });

  it('serializes concurrent updates of one user into a single entry log', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => send('u1', OUTER_ONLY, i)),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await logsOf('u1')).toHaveLength(1);
  });

  it('validates the payload', async () => {
    await http()
      .post('/locations')
      .send({ userId: 'u1', latitude: 95, longitude: 29, timestamp: at(0) })
      .expect(400);
    await http()
      .post('/locations')
      .send({ ...OUTER_ONLY, userId: 'u1', timestamp: '2026-10-25T09:00:00' })
      .expect(400);
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    await http()
      .post('/locations')
      .send({ ...OUTER_ONLY, userId: 'u1', timestamp: future })
      .expect(400);
  });
});
