require('./helpers');
const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

describe('GET /api/v1/metrics/summary', () => {
  test('aggregates + caches (MISS then HIT)', async () => {
    await request(app).post('/api/v1/telemetry')
      .send({ deviceId: 's-1', metric: 'temperature', value: 70 });
    await request(app).post('/api/v1/telemetry')
      .send({ deviceId: 's-2', metric: 'temperature', value: 90 });

    // allow background cache invalidation to settle
    await new Promise((r) => setTimeout(r, 100));
    const cache = require('../src/services/cache.service');
    for (const k of [...cache._memory.keys()]) cache._memory.delete(k);

    const first = await request(app).get('/api/v1/metrics/summary');
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');
    expect(first.body.totals.totalEvents).toBeGreaterThanOrEqual(2);

    const second = await request(app).get('/api/v1/metrics/summary');
    expect(second.status).toBe(200);
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body.totals.totalEvents).toBe(first.body.totals.totalEvents);
  });
});
