require('./helpers');
const request = require('supertest');
const createApp = require('../src/app');
const AuditLog = require('../src/models/AuditLog');

const app = createApp();

describe('GET /api/v1/admin/audit-logs', () => {
  test('401 without api key', async () => {
    const res = await request(app).get('/api/v1/admin/audit-logs');
    expect(res.status).toBe(401);
  });

  test('403 with wrong role', async () => {
    const res = await request(app).get('/api/v1/admin/audit-logs')
      .set('x-api-key', 'test-key').set('x-role', 'hacker');
    expect(res.status).toBe(403);
  });

  test('200 with pagination + filtering', async () => {
    await AuditLog.create([
      { action: 'telemetry.ingested', actor: 's-1' },
      { action: 'login', actor: 'ops' },
    ]);
    const res = await request(app).get('/api/v1/admin/audit-logs?page=1&limit=1')
      .set('x-api-key', 'test-key').set('x-role', 'viewer');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.data).toHaveLength(1);

    const filtered = await request(app).get('/api/v1/admin/audit-logs?action=login')
      .set('x-api-key', 'test-key').set('x-role', 'admin');
    expect(filtered.body.total).toBe(1);
  });
});
