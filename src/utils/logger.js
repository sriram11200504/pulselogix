const pino = require('pino');
const config = require('../config');

const logger = pino({
  level: config.logLevel,
  base: { service: 'pulselogix' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

module.exports = logger;
