/**
 * logger.js
 * ─────────────────────────────────────────────
 * Logger sederhana berbasis console dengan level filtering.
 * Di production, ganti dengan winston / pino untuk structured JSON logging.
 */

'use strict';

const config = require('../../config/config');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[config.LOG_LEVEL] ?? LEVELS.info;

function log(level, message) {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString();
  console[level === 'debug' ? 'log' : level](`[${ts}] [${level.toUpperCase()}] ${message}`);
}

module.exports = {
  debug: (msg) => log('debug', msg),
  info:  (msg) => log('info',  msg),
  warn:  (msg) => log('warn',  msg),
  error: (msg) => log('error', msg),
};