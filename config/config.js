/**
 * config.js
 * ─────────────────────────────────────────────
 * Konfigurasi server yang dibaca dari environment variable.
 * Gunakan file .env (via dotenv) di lokal, dan env var asli di production.
 *
 * JANGAN hardcode nilai sensitif (JWT_SECRET, dll) di sini.
 */

'use strict';

require('dotenv').config();

module.exports = {
  // Port tempat HTTP/WS server berjalan
  PORT: parseInt(process.env.PORT ?? '8080', 10),

  // Secret key untuk sign & verify JWT
  // Di production: gunakan secret panjang dan acak (min 256-bit)
  JWT_SECRET: process.env.JWT_SECRET ?? 'change_this_in_production_use_256bit_random',

  // Interval ping heartbeat (ms) — deteksi koneksi zombie
  HEARTBEAT_INTERVAL_MS: parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '30000', 10),

  // Log level: 'debug' | 'info' | 'warn' | 'error'
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
};