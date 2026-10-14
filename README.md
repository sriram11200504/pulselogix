# PulseLogix — Enterprise IoT & Real-Time Event Monitoring Platform

High-volume, low-latency telemetry ingestion + real-time ops dashboard. Built to showcase startup-grade backend engineering: fast writes (sub-50ms), Redis-cached aggregation pipelines, Redis session management, background event processing simulating Kafka/RabbitMQ, and containerized multi-stage Docker deployment.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────────────────────┐
                      │                 Express API Application                │
                      │                                                        │
                      │  [Sliding-Window Rate Limiter (Redis Sorted-Set)]      │
                      │  [Centralized Request Logger (Pino Structured JSON)]   │
                      │  [Joi Request & Query Validators]                      │
                      │  [Dual Auth: Redis Session Tokens / Admin API Key]     │
                      └────────┬───────────────────────┬───────────────────────┘
                               │                       │
                ┌──────────────▼──────────┐ ┌──────────▼──────────────┐
                │        MongoDB 7        │ │        Redis 7          │
                │ ─────────────────────── │ │ ─────────────────────── │
                │ • Telemetry Collection  │ │ • Aggregation Cache     │
                │   (Compound Indexes)    │ │   (Auto-invalidation)   │
                │ • Device Registry       │ │ • Sliding-Window Limiter│
                │ • AuditLog Collection   │ │ • Active Session Store  │
                │ • Aggregation Pipelines │ │ • Pub/Sub Inter-Node    │
                └─────────────────────────┘ └──────────┬──────────────┘
                                                       │
                                            ┌──────────▼──────────────┐
                                            │ Async EventBus Layer    │
                                            │ ─────────────────────── │
                                            │ • Kafka / RabbitMQ sim  │
                                            │ • Background Audit Log  │
                                            │ • Threshold Alerts      │
                                            └──────────┬──────────────┘
                                                       │
                                            ┌──────────▼──────────────┐
                                            │ Operations Dashboard    │
                                            │ (Tailwind + EJS UI)     │
                                            │ Live Simulator Testpad  │
                                            └─────────────────────────┘
```

### High-Volume Write Flow — `POST /api/v1/telemetry` (Sub-50ms Target)
1. **Sliding-Window Rate Limiter**: Redis sorted-set (`ZREMRANGEBYSCORE`, `ZADD`, `ZCARD`, `PEXPIRE`) tracks hits per client IP; fails open to memory fallback if Redis is unavailable.
2. **Joi Schema Validation**: Validates `deviceId`, `metric`, `value`, `unit`, and optional metadata. Strips unknown fields automatically.
3. **Single Indexed Insert**: Direct write to MongoDB `telemetries` without slow joins. Compound indexes:
   - `{ deviceId: 1, timestamp: -1 }`
   - `{ metric: 1, timestamp: -1 }`
   - `{ deviceId: 1, metric: 1, timestamp: -1 }`
4. **Async EventBus Dispatch**: Non-blocking `eventBus.publish('telemetry.ingested', ...)` runs on `setImmediate` (never blocks HTTP response cycle).
5. **Cache Invalidation & Fleet Sync**: Fire-and-forget device upsert + `cache.del('metrics:summary')` clears all time-window variants across Redis and memory.
6. **Ultra-Low Latency Response**: Returns `201 Created` with payload ID and measured microsecond latency `latencyMs` (<50ms).

### Analytical Read Flow — `GET /api/v1/metrics/summary?sinceHours=24`
1. **Redis Cache Check**: Generates key `metrics:summary:<sinceHours>h`. Returns `X-Cache: HIT` in ~1-3ms.
2. **MongoDB Aggregation Pipeline**: On cache miss, runs 3 parallel pipelines via `Promise.all`:
   - Metric aggregates: count, average value, min, max (`$match`, `$group`, `$sort`, `$project`).
   - Fleet summary: total events and unique connected devices (`$addToSet`, `$size`).
   - Top-10 devices: device event rankings (`$group`, `$sort`, `$limit`).
3. **Cache Storage**: Results cached in Redis for `CACHE_TTL_METRICS_SUMMARY` (default 30s) and returned with `X-Cache: MISS`.

### Security & Session Management — `src/services/session.service.js`
- **Redis Session Store**: Manages stateful user/ops sessions in Redis with TTL and in-memory Map fallback.
- **Dual Authentication Strategies**:
  - `Authorization: Bearer <sessionId>` or `x-session-id` (Redis session token)
  - `x-api-key: <ADMIN_API_KEY>` (Stateless direct API key)
- **Role-Based Access Control (RBAC)**: Support for `viewer`, `support`, and `admin` roles on sensitive endpoints.

---

## Tech Stack

| Layer | Technology | Key Capabilities |
|---|---|---|
| **Backend** | Node.js (v20+), Express.js | Modular service architecture, ES6+ async/await, centralized error handling |
| **Database** | MongoDB 7, Mongoose 8 | Compound indexes, aggregation pipelines, connection pooling (min 5, max 50) |
| **Caching & Rate Limiting** | Redis 7, ioredis | Sliding-window limiter via sorted sets, query caching, session management |
| **Messaging / EventBus** | Modular Async EventBus | Kafka/RabbitMQ simulation with local `EventEmitter` and Redis multi-node bridge |
| **Validation** | Joi | Strict payload validation for bodies and query parameters |
| **Logging & Observability** | Pino, Pino-HTTP | Structured JSON logs tracking method, URL, status code, latency (ms), client IP |
| **Ops Dashboard** | EJS, Tailwind CSS | Real-time glassmorphism dashboard, KPI analytics, interactive live simulator |
| **Testing** | Jest, Supertest | Hermetic unit & integration test suites, instant in-memory DB mock |
| **DevOps** | Docker, Docker Compose | Multi-stage build (`deps` → `runner`), non-root user, automated healthchecks |

---

## Project Structure

```
pulselogix/
├── Dockerfile                  # Multi-stage production build (deps -> non-root runner)
├── docker-compose.yml          # Node app + MongoDB 7 + Redis 7 with healthchecks
├── package.json                # Dependencies, scripts, and Jest config
├── README.md                   # Complete architectural and operational guide
├── verify.nodb.js              # Standalone DB-free verification suite
├── src/
│   ├── app.js                  # Express app setup (security, routes, centralized errors)
│   ├── server.js               # Startup lifecycle, DB & Redis connections, graceful shutdown
│   ├── config/
│   │   ├── index.js            # Central environment configuration
│   │   ├── db.js               # Mongoose connection with pooling
│   │   └── redis.js            # ioredis client with ping-check & memory fallback
│   ├── controllers/
│   │   ├── admin.controller.js     # Audit log listing controller
│   │   ├── metrics.controller.js   # Metrics summary controller
│   │   └── telemetry.controller.js # Single & batch ingestion controller
│   ├── events/
│   │   ├── eventBus.js         # Async pub/sub broker simulating Kafka/RabbitMQ
│   │   └── handlers.js         # Audit log writer & threshold breach alerters
│   ├── middleware/
│   │   ├── auth.js             # Dual session/API-key auth + RBAC guard
│   │   ├── errorHandler.js     # Centralized error handler + JSON request logger
│   │   ├── rateLimiter.js      # Sliding-window rate limiter
│   │   └── validate.js         # Joi schema validation middleware
│   ├── models/
│   │   ├── AuditLog.js         # Operations audit log schema & indexes
│   │   ├── Device.js           # IoT device registry schema
│   │   └── Telemetry.js        # High-volume metrics schema & compound indexes
│   ├── routes/
│   │   ├── admin.routes.js     # /api/v1/admin/audit-logs
│   │   ├── auth.routes.js      # /api/v1/auth/session (Redis session endpoints)
│   │   ├── dashboard.routes.js # GET / (ops UI) & /api/v1/dashboard/overview
│   │   ├── health.routes.js    # /health & /ready probes
│   │   └── telemetry.routes.js # /api/v1/telemetry (single & batch)
│   ├── services/
│   │   ├── audit.service.js    # Paginated audit log querying
│   │   ├── cache.service.js    # Transparent Redis/in-memory cache
│   │   ├── metrics.service.js  # MongoDB 3-stage aggregation pipeline
│   │   ├── session.service.js  # Redis session storage & lifecycle
│   │   └── telemetry.service.js# Ingest fast-path & event bus dispatch
│   ├── utils/
│   │   ├── ApiError.js         # Standard operational HTTP errors
│   │   ├── logger.js           # Structured JSON Pino logger
│   │   └── pagination.js       # Pagination parser and response formatter
│   ├── validators/
│   │   ├── query.validator.js      # Joi schemas for query parameters
│   │   └── telemetry.validator.js  # Joi schemas for telemetry payloads
│   └── views/
│       └── dashboard.ejs       # Premium cyberpunk glassmorphic ops dashboard
└── tests/
    ├── setup.js                # Global Jest configuration
    ├── helpers.js              # Resilient in-memory DB mock adapter
    ├── admin.test.js           # Audit logs & RBAC integration tests
    ├── metrics.test.js         # Aggregation & cache HIT/MISS tests
    ├── session.test.js         # Redis session store & token auth tests
    └── telemetry.test.js       # Ingest latency, validation, and batch tests
```

---

## Quickstart

### 1. Run with Docker Compose (Recommended)

Spins up the Node.js application, MongoDB, and Redis with healthchecks using a single command:

```bash
# Clone and enter workspace
cp .env.example .env

# Spin up entire containerized stack
docker compose up --build
```

- **Operations Dashboard**: [http://localhost:3000/](http://localhost:3000/)
- **Liveness Probe**: [http://localhost:3000/health](http://localhost:3000/health)
- **Readiness Probe**: [http://localhost:3000/ready](http://localhost:3000/ready)

### 2. Run Locally for Development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start development server with auto-reload
npm run dev
```

---

## Environment Configuration (`.env.example`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP service listener port |
| `NODE_ENV` | `development` | Environment mode (`production`, `development`, `test`) |
| `MONGODB_URI` | `mongodb://localhost:27017/pulselogix` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `REDIS_ENABLED` | `true` | When `false`, gracefully falls back to in-memory store |
| `CACHE_TTL_METRICS_SUMMARY` | `30` | Seconds to cache metrics aggregation results |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Sliding rate limit window duration in ms |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Global default max requests per window |
| `ADMIN_API_KEY` | `changeme-super-secret-key` | Master API key for administrative & session access |
| `LOG_LEVEL` | `info` | Pino log verbosity (`trace`, `debug`, `info`, `warn`, `error`) |

---

## API Reference

### 1. Ingest Telemetry Payload (Sub-50ms)
```bash
POST /api/v1/telemetry
Content-Type: application/json

{
  "deviceId": "sensor-01",
  "metric": "temperature",
  "value": 72.5,
  "unit": "C",
  "metadata": { "firmware": "v2.1" }
}
```
**Response (`201 Created`):**
```json
{
  "id": "670cfa34b281f63...",
  "deviceId": "sensor-01",
  "metric": "temperature",
  "value": 72.5,
  "latencyMs": 14.8
}
```

### 2. Batch Ingest Telemetry
```bash
POST /api/v1/telemetry/batch
Content-Type: application/json

{
  "batch": [
    { "deviceId": "sensor-01", "metric": "temperature", "value": 73.1 },
    { "deviceId": "sensor-02", "metric": "cpu", "value": 42.0 }
  ]
}
```

### 3. Aggregated Metrics Summary (Redis Cached)
```bash
GET /api/v1/metrics/summary?sinceHours=24
```
**Response Headers:** `X-Cache: HIT` or `X-Cache: MISS`  
**Response (`200 OK`):**
```json
{
  "window": { "sinceHours": 24, "since": "2026-10-13T10:00:00.000Z" },
  "totals": { "totalEvents": 1420, "uniqueDevices": 48 },
  "byMetric": [
    { "metric": "temperature", "count": 710, "avgValue": 71.4, "minValue": 62.1, "maxValue": 96.5 },
    { "metric": "cpu", "count": 710, "avgValue": 44.2, "minValue": 12.0, "maxValue": 98.4 }
  ],
  "topDevices": [
    { "deviceId": "sensor-01", "events": 350 },
    { "deviceId": "sensor-02", "events": 280 }
  ],
  "generatedAt": "2026-10-14T10:05:00.000Z",
  "_cache": "hit"
}
```

### 4. Create Redis-Managed Session
```bash
POST /api/v1/auth/session
Content-Type: application/json

{
  "apiKey": "changeme-super-secret-key",
  "role": "admin",
  "userId": "ops-lead"
}
```
**Response (`201 Created`):**
```json
{
  "message": "Session created successfully",
  "session": {
    "id": "3f7c4618-...",
    "userId": "ops-lead",
    "role": "admin",
    "createdAt": "2026-10-14T10:05:00.000Z",
    "lastActiveAt": "2026-10-14T10:05:00.000Z"
  }
}
```

### 5. Query Audit Logs (RBAC Protected)
Supports authentication via `Authorization: Bearer <sessionId>` or `x-api-key`:
```bash
GET /api/v1/admin/audit-logs?page=1&limit=20&action=telemetry.ingested
Authorization: Bearer <sessionId>
```

---

## Testing & Verification

Run the comprehensive Jest test suite:

```bash
npm test
```

### Test Suite Summary:
- `tests/telemetry.test.js`: Validates sub-50ms ingestion latency, Joi payload schema validation (400 responses), and high-volume batch ingestion.
- `tests/metrics.test.js`: Validates MongoDB aggregation pipelines, Redis cache MISS on first read, HIT on subsequent read, and automatic cache invalidation on new writes.
- `tests/session.test.js`: Validates Redis session creation, session lookup, Bearer token authentication, and session termination (logout).
- `tests/admin.test.js`: Validates RBAC permissions (viewer, support, admin), unauthorized 401, forbidden 403, pagination, and multi-field filtering.

Run standalone DB-free verification check:
```bash
node verify.nodb.js
```

---

## Production Readiness & Architecture Guarantees

1. **Sub-50ms Ingestion**: Writes directly bypass Mongoose cascading hooks; downstream tasks (threshold alerts, audit trails) are dispatched asynchronously via `setImmediate`.
2. **Horizontal Scalability**: The EventBus bridges to Redis pub/sub channels (`pulselogix:*`), allowing multiple stateless Node instances to share event streams across clusters.
3. **Pluggable Event Brokers**: The message broker layer in `src/events/eventBus.js` exposes standard `publish()` and `subscribe()` interfaces, allowing one-file swap-in for Apache Kafka or RabbitMQ.
4. **Resilient Degradation**: If Redis or MongoDB experiences downtime, the system fails open with in-memory caching and sliding-window rate limiting, returning descriptive JSON health status via `/ready`.
