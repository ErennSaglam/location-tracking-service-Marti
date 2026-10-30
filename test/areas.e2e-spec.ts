import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, resetDatabase } from './test-app.js';
import { polygon, square } from './geo-fixtures.js';

describe('Areas (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates nested and overlapping areas and lists them as GeoJSON', async () => {
    const outer = square(29.0, 41.0, 0.1);

    const created = await http()
      .post('/areas')
      .send({ name: 'Outer', polygon: polygon(outer) })
      .expect(201);
    expect(created.body).toMatchObject({
      id: 1,
      name: 'Outer',
      polygon: { type: 'Polygon', coordinates: outer },
    });

    await http()
      .post('/areas')
      .send({ name: 'Inner', polygon: polygon(square(29.02, 41.02, 0.02)) })
      .expect(201);
    await http()
      .post('/areas')
      .send({ name: 'Overlapping', polygon: polygon(square(29.05, 41.05, 0.1)) })
      .expect(201);

    const list = await http().get('/areas').expect(200);
    expect(list.body.map((a: { name: string }) => a.name)).toEqual([
      'Outer',
      'Inner',
      'Overlapping',
    ]);
  });

  it('rejects invalid input', async () => {
    const bowTie = [
      [
        [29.0, 41.0],
        [29.1, 41.1],
        [29.1, 41.0],
        [29.0, 41.1],
        [29.0, 41.0],
      ],
    ];
    const res = await http()
      .post('/areas')
      .send({ name: 'BowTie', polygon: polygon(bowTie) })
      .expect(400);
    expect(res.body.message).toMatch(/Invalid polygon: Self-intersection/);

    const [ring] = square(29.0, 41.0, 0.1);
    const unclosed = [ring.slice(0, -1)];
    await http()
      .post('/areas')
      .send({ name: 'Unclosed', polygon: polygon(unclosed) })
      .expect(400);

    const valid = { name: 'Dup', polygon: polygon(square(29.0, 41.0, 0.1)) };
    await http().post('/areas').send(valid).expect(201);
    await http().post('/areas').send(valid).expect(409);
  });
});
