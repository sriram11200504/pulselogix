const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const { requestLogger, errorHandler, notFound } = require('./middleware/errorHandler');
const { rateLimiter } = require('./middleware/rateLimiter');

const telemetryRoutes = require('./routes/telemetry.routes');
const metricsRoutes = require('./routes/metrics.routes');
const adminRoutes = require('./routes/admin.routes');
const authRoutes = require('./routes/auth.routes');
const healthRoutes = require('./routes/health.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(requestLogger);
  app.use(rateLimiter()); // global gentle limit

  // Ops dashboard (server-rendered)
  app.use('/', dashboardRoutes);

  // API v1
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/telemetry', telemetryRoutes);
  app.use('/api/v1/metrics', metricsRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/', healthRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
