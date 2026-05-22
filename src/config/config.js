'use strict';

require('dotenv').config();

module.exports = {
  WS_PORT:                parseInt(process.env.WS_PORT  ?? '8080', 10),
  TCP_PORT:               parseInt(process.env.TCP_PORT ?? '9000', 10),
  JWT_SECRET:             process.env.JWT_SECRET ?? 'change_this_in_production',
  HMAC_SECRET:            process.env.HMAC_SECRET ?? '',
  HEARTBEAT_INTERVAL_MS:  parseInt(process.env.HEARTBEAT_INTERVAL_MS  ?? '30000', 10),
  SOCKET_IDLE_TIMEOUT_MS: parseInt(process.env.SOCKET_IDLE_TIMEOUT_MS ?? '120000', 10),
  LOG_LEVEL:              process.env.LOG_LEVEL ?? 'info',
};
