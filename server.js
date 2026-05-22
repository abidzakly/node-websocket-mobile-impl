// server/server.js
//
// ─────────────────────────────────────────────────────────────────────────────
// Main entry point — starts BOTH servers simultaneously
// ─────────────────────────────────────────────────────────────────────────────
//
//   WebSocket server  → port 8080  (ngrok http 8080)
//   Raw TCP server    → port 9000  (ngrok tcp 9000)
//
// Both servers share:
//   - Same JWT secret (auth_handler.js)
//   - Same command routing (command_handler.js)
//   - Same logger

'use strict';

const config   = require('./src/config/config');
const logger   = require('./src/utils/logger');
const { createWsServer }  = require('./src/handlers/ws_handler');
const { createTcpServer } = require('./src/handlers/tcp_handler');

// ── Start WebSocket server ────────────────────────────────────────────────────
const wss = createWsServer({
  port:   config.WS_PORT,
  logger,
});

// ── Start Raw TCP server ──────────────────────────────────────────────────────
const tcpServer = createTcpServer({
  port:                config.TCP_PORT,
  heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
  idleTimeoutMs:       config.SOCKET_IDLE_TIMEOUT_MS,
  logger,
});

logger.info('─────────────────────────────────────────────');
logger.info(`WebSocket server : ws://0.0.0.0:${config.WS_PORT}`);
logger.info(`Raw TCP server   : tcp://0.0.0.0:${config.TCP_PORT}`);
logger.info('─────────────────────────────────────────────');
logger.info('ngrok tunnels:');
logger.info(`  ngrok http ${config.WS_PORT}   ← WebSocket (free plan)`);
logger.info(`  ngrok tcp  ${config.TCP_PORT}   ← Raw TCP (paid plan)`);
logger.info('─────────────────────────────────────────────');

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM — shutting down...');
  wss.close();
  tcpServer.close(() => {
    logger.info('Servers closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT — shutting down...');
  wss.close();
  tcpServer.close(() => process.exit(0));
});
