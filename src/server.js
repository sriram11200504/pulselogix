const config = require('./config');
const logger = require('./utils/logger');
const { connectDB } = require('./config/db');
const { initRedis, closeRedis } = require('./config/redis');
const { registerHandlers } = require('./events/handlers');
const { bridgeRedis } = require('./events/eventBus');
const createApp = require('./app');

async function start() {
  registerHandlers();
  try {
    await connectDB();
  } catch (err) {
    logger.error({ msg: 'mongodb_connect_failed', err: err.message });
    if (config.env === 'production') process.exit(1);
  }
  await initRedis();
  bridgeRedis();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ msg: 'server_started', port: config.port, env: config.env });
  });

  const shutdown = async (signal) => {
    logger.info({ msg: 'shutdown', signal });
    server.close(async () => {
      const { disconnectDB } = require('./config/db');
      await disconnectDB().catch(() => {});
      await closeRedis().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server };
}

if (require.main === module) {
  start().catch((err) => {
    logger.error({ msg: 'startup_failed', err: err.message });
    process.exit(1);
  });
}

module.exports = { start };
