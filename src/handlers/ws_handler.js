// server/src/handlers/ws_handler.js
//
// ─────────────────────────────────────────────────────────────────────────────
// WebSocket Handler — Port 8080
// ─────────────────────────────────────────────────────────────────────────────
//
// Protocol: RFC 6455 WebSocket (via 'ws' library)
//
// Connection flow:
//   1. Client HTTP GET with "Upgrade: websocket"
//   2. Server replies "101 Switching Protocols"
//   3. JWT validated from URL query param (?token=...)
//   4. If valid → connection open, ready for COMMAND messages
//   5. Client sends { "requestId", "command" }
//   6. Server replies { "type": "DATA_RESPONSE", ... }
//
// Auth is done at upgrade time — no AUTH message needed after connect.
// WebSocket library handles PING/PONG frames at protocol level.

'use strict';

const { WebSocketServer } = require('ws');
const { v4: uuidv4 }     = require('uuid');
const { verifyToken, verifySignature } = require('./auth_handler');
const { handleCommand }  = require('./command_handler');

/**
 * createWsServer — create and return a WebSocket server on the given port.
 *
 * @param {object} opts
 * @param {number} opts.port
 * @param {object} opts.logger
 */
function createWsServer({ port, logger }) {
  const wss = new WebSocketServer({ port });
  const clients = new Map(); // clientId → ws

  wss.on('connection', (ws, req) => {
    const clientId = uuidv4();

    // ── Auth: verify JWT from query string ────────────────────────────────────
    const url   = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      logger.warn(`[WS:${clientId}] Rejected — no token in URL`);
      ws.close(4001, 'Authentication required');
      return;
    }

    let user;
    try {
      user = verifyToken(token);
    } catch (err) {
      logger.warn(`[WS:${clientId}] Rejected — invalid token: ${err.message}`);
      ws.close(4003, 'Invalid token');
      return;
    }

    clients.set(clientId, ws);
    logger.info(`[WS:${clientId}] Connected — user: ${user.userId}`);

    // Notify client of successful connection
    ws.send(JSON.stringify({
      type:      'CONNECTION_ACK',
      clientId,
      message:   'WebSocket connected and authenticated',
      requestId: '',
      timestamp: Date.now(),
    }));

    // ── Message handling ───────────────────────────────────────────────────────
    ws.on('message', (rawData) => {
      let message;
      try {
        message = JSON.parse(rawData.toString());
      } catch {
        ws.send(JSON.stringify({
          type: 'ERROR', code: 'INVALID_JSON',
          message: 'Message must be valid JSON', timestamp: Date.now(),
        }));
        return;
      }

      if (message.signature && !verifySignature(message)) {
        ws.send(JSON.stringify({
          type: 'ERROR', code: 'INVALID_SIGNATURE',
          message: 'Signature verification failed',
          requestId: message.requestId, timestamp: Date.now(),
        }));
        return;
      }

      logger.debug(`[WS:${clientId}] Received: ${JSON.stringify(message)}`);

      // WebSocket doesn't need AUTH/PING/PONG messages — handled at protocol level
      if (!message.command) {
        ws.send(JSON.stringify({
          type: 'ERROR', code: 'NO_COMMAND',
          message: 'command field required',
          requestId: message.requestId, timestamp: Date.now(),
        }));
        return;
      }

      handleCommand({
        clientId,
        command:   message.command,
        requestId: message.requestId ?? '',
        sendFn:    (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)),
        logger,
      });
    });

    ws.on('close', () => {
      clients.delete(clientId);
      logger.info(`[WS:${clientId}] Disconnected`);
    });

    ws.on('error', (err) => {
      clients.delete(clientId);
      logger.error(`[WS:${clientId}] Error: ${err.message}`);
    });
  });

  wss.on('listening', () => {
    logger.info(`WebSocket server listening on port ${port}`);
  });

  wss.on('error', (err) => {
    logger.error(`WebSocket server error: ${err.message}`);
  });

  return wss;
}

module.exports = { createWsServer };
