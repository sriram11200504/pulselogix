require('./helpers');
const request = require('supertest');
const createApp = require('../src/app');
const sessionService = require('../src/services/session.service');

const app = createApp();

describe('Redis Session Management & Auth', () => {
  test('POST /api/v1/auth/session rejects invalid api key with 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/session')
      .send({ apiKey: 'wrong-key' });
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/auth/session creates session with valid api key', async () => {
    const res = await request(app)
      .post('/api/v1/auth/session')
      .send({ apiKey: 'test-key', role: 'admin', userId: 'ops-lead' });
    expect(res.status).toBe(201);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.userId).toBe('ops-lead');
    expect(res.body.session.role).toBe('admin');
  });

  test('Authenticates protected admin route via Bearer session token', async () => {
    // 1. Create a session
    const session = await sessionService.createSession('lead-admin', { role: 'admin' });

    // 2. Access /api/v1/admin/audit-logs using Bearer token
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${session.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  test('Session destruction (logout) invalidates session token', async () => {
    const session = await sessionService.createSession('temp-user', { role: 'viewer' });

    // Access succeeds
    const check1 = await request(app)
      .get('/api/v1/auth/session')
      .set('x-session-id', session.id);
    expect(check1.status).toBe(200);

    // Logout
    const logout = await request(app)
      .delete('/api/v1/auth/session')
      .set('x-session-id', session.id);
    expect(logout.status).toBe(200);

    // Subsequent access fails
    const check2 = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('x-session-id', session.id);
    expect(check2.status).toBe(401);
  });
});
