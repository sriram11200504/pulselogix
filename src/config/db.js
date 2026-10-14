const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

let connected = false;

async function connectDB(uri = config.mongoUri) {
  if (connected) return mongoose.connection;
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 1500,
  });
  connected = true;
  logger.info({ msg: 'mongodb_connected' });
  return mongoose.connection;
}

async function disconnectDB() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

module.exports = { connectDB, disconnectDB };
