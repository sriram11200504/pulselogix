/**
 * Modular async event bus simulating Kafka/RabbitMQ patterns.
 *
 * Design:
 *  - `publish(topic, payload)` — durable-ish fan-out to all subscribers.
 *  - `subscribe(topic, handler)` — register async consumer.
 *  - In-memory delivery via setImmediate (non-blocking, sub-50ms ingest path).
 *  - If Redis is ready, also pub/subs over Redis channels `pulselogix:<topic>`
 *    so multiple Node replicas share the stream (horizontal scalability).
 *  - Swap-in point: replace _redisFanout with Kafka producer / RabbitMQ channel
 *    without touching controllers (see README "Event streaming").
 */
const { EventEmitter } = require('events');
const logger = require('../utils/logger');
const { getRedis, isRedisReady } = require('../config/redis');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

const stats = { published: 0, handled: 0, errors: 0 };

function subscribe(topic, handler) {
  const wrapped = async (payload) => {
    try {
      await handler(payload);
      stats.handled += 1;
    } catch (err) {
      stats.errors += 1;
      logger.error({ msg: 'event_handler_error', topic, err: err.message });
    }
  };
  emitter.on(topic, wrapped);
  return () => emitter.off(topic, wrapped);
}

function localDispatch(topic, payload) {
  const listeners = emitter.listeners(topic);
  for (const fn of listeners) {
    setImmediate(() => fn(payload)); // never block the request cycle
  }
}

function publish(topic, payload) {
  stats.published += 1;
  const envelope = { topic, payload, publishedAt: new Date().toISOString() };
  localDispatch(topic, envelope);
  // Cross-instance fan-out (best effort, never awaited on hot path)
  try {
    if (isRedisReady()) {
      getRedis()
        .publish(`pulselogix:${topic}`, JSON.stringify(envelope))
        .catch((err) => logger.warn({ msg: 'event_redis_publish_failed', err: err.message }));
    }
  } catch { /* noop */ }
  return envelope;
}

/** Subscribe this instance to Redis channels so events from other replicas arrive locally. */
function bridgeRedis() {
  try {
    if (!isRedisReady()) return;
    const sub = getRedis().duplicate();
    sub.on('message', (channel, message) => {
      try {
        const topic = channel.replace('pulselogix:', '');
        localDispatch(topic, JSON.parse(message));
      } catch (err) {
        logger.warn({ msg: 'event_redis_message_parse_failed', err: err.message });
      }
    });
    sub.subscribe('pulselogix:telemetry.ingested', 'pulselogix:alert.triggered', 'pulselogix:audit.write')
      .catch((err) => logger.warn({ msg: 'event_redis_subscribe_failed', err: err.message }));
  } catch (err) {
    logger.warn({ msg: 'event_bridge_failed', err: err.message });
  }
}

function getStats() {
  return { ...stats, topics: emitter.eventNames() };
}

module.exports = { publish, subscribe, bridgeRedis, getStats };
