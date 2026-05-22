'use strict';

const config = require('../config/config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const current = LEVELS[config.LOG_LEVEL] ?? 1;

const ts = () => new Date().toISOString();

module.exports = {
  debug: (msg) => current <= 0 && console.log(`[${ts()}] DEBUG ${msg}`),
  info:  (msg) => current <= 1 && console.log(`[${ts()}] INFO  ${msg}`),
  warn:  (msg) => current <= 2 && console.warn(`[${ts()}] WARN  ${msg}`),
  error: (msg) => current <= 3 && console.error(`[${ts()}] ERROR ${msg}`),
};
