const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const latencyMs = Number(end - start) / 1e6;
    logger.info({
      msg: 'http_request',
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      latencyMs: Math.round(latencyMs * 100) / 100,
      ip: req.ip,
    });
    // expose latency for audit consumers
    req.latencyMs = latencyMs;
  });
  next();
}

// Centralized error handling — always last middleware
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const message = err.isOperational || status < 500 ? err.message : 'Internal server error';
  logger.error({
    msg: 'http_error',
    method: req.method,
    url: req.originalUrl,
    status,
    err: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
  res.status(status).json({
    error: message,
    ...(err.details ? { details: err.details } : {}),
    ...(process.env.NODE_ENV === 'development' && status >= 500 ? { stack: err.stack } : {}),
  });
}

function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = { requestLogger, errorHandler, notFound };
