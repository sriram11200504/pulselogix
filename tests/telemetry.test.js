require('./helpers');
const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

describe('POST /api/v1/telemetry', () => {
  test('ingests valid payload with 201 + latency', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry')
      .send({ deviceId: 'sensor-01', metric: 'temperature', value: 72.5, unit: 'C' });
    expect(res.status).toBe(201);
    expect(res.body.deviceId).toBe('sensor-01');
    expect(typeof res.body.latencyMs).toBe('number');
  });

  test('rejects invalid payload with 400', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry')
      .send({ deviceId: '', metric: 'temperature' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation/i);
  });

  test('batch ingest works', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry/batch')
      .send({ batch: [
        { deviceId: 'd1', metric: 'cpu', value: 10 },
        { deviceId: 'd1', metric: 'cpu', value: 20 },
      ]});
    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(2);
  });
});
