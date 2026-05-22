// server/src/handlers/tcp_handler.js
//
// ─────────────────────────────────────────────────────────────────────────────
// Raw TCP Socket Handler — Port 9000
// ─────────────────────────────────────────────────────────────────────────────
//
// Protocol: Pure TCP with length-prefix framing
//
// Wire format: [4-byte UINT32 BE payload length][UTF-8 JSON payload]
//
// Connection flow:
//   1. Client opens TCP connection (3-way handshake)
//   2. Client sends AUTH { token } within 10 seconds
//   3. Server verifies JWT → sends CONNECTION_ACK
//   4. Client sends COMMAND messages
//   5. Server replies DATA_RESPONSE
//   6. Heartbeat: server sends PING → client replies PONG

'use strict';

const net    = require('net');
const { v4: uuidv4 } = require('uuid');
const { verifyToken, verifySignature } = require('./auth_handler');
const { handleCommand }  = require('./command_handler');

const HEADER_SIZE     = 4;
const MAX_PAYLOAD     = 1024 * 1024; // 1 MB
const AUTH_TIMEOUT_MS = 10_000;

function createTcpServer({ port, heartbeatIntervalMs, idleTimeoutMs, logger }) {
  const clients = new Map(); // clientId → ctx

  const server = net.createServer({ allowHalfOpen: false }, (socket) => {
    const clientId   = uuidv4();
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    logger.info(`[TCP:${clientId}] Connected from ${remoteAddr}`);

    const ctx = {
      socket,
      clientId,
      isAuthenticated: false,
      user: null,
      isAlive: true,
      buffer: Buffer.alloc(0),
    };
    clients.set(clientId, ctx);

    // Auth timeout — close if client doesn't AUTH in time
    const authTimer = setTimeout(() => {
      if (!ctx.isAuthenticated) {
        logger.warn(`[TCP:${clientId}] Auth timeout`);
        sendMsg(socket, {
          type: 'ERROR', code: 'AUTH_TIMEOUT',
          message: 'Authentication required within 10 seconds',
        });
        socket.destroy();
      }
    }, AUTH_TIMEOUT_MS);

    socket.setTimeout(idleTimeoutMs);
    socket.on('timeout', () => {
      logger.warn(`[TCP:${clientId}] Idle timeout`);
      socket.destroy();
    });

    // ── Data: accumulate and parse length-prefixed frames ─────────────────────
    socket.on('data', (chunk) => {
      ctx.buffer = Buffer.concat([ctx.buffer, chunk]);

      // Extract all complete messages from buffer
      while (true) {
        if (ctx.buffer.length < HEADER_SIZE) break;

        const payloadLength = ctx.buffer.readUInt32BE(0);
        if (payloadLength > MAX_PAYLOAD) {
          logger.error(`[TCP:${clientId}] Payload too large: ${payloadLength}`);
          socket.destroy();
          return;
        }

        const totalLength = HEADER_SIZE + payloadLength;
        if (ctx.buffer.length < totalLength) break;

        const payload  = ctx.buffer.slice(HEADER_SIZE, totalLength);
        ctx.buffer     = ctx.buffer.slice(totalLength);

        handleTcpMessage(ctx, payload, authTimer, logger, clients);
      }
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      clients.delete(clientId);
      logger.info(`[TCP:${clientId}] Disconnected`);
    });

    socket.on('error', (err) => {
      clearTimeout(authTimer);
      clients.delete(clientId);
      logger.error(`[TCP:${clientId}] Error: ${err.message}`);
    });
  });

  // ── Heartbeat: detect zombie connections ───────────────────────────────────
  setInterval(() => {
    for (const [clientId, ctx] of clients.entries()) {
      if (!ctx.isAuthenticated) continue;
      if (!ctx.isAlive) {
        logger.warn(`[TCP:${clientId}] Zombie — terminating`);
        ctx.socket.destroy();
        clients.delete(clientId);
        continue;
      }
      ctx.isAlive = false;
      sendMsg(ctx.socket, {
        type: 'PING', requestId: uuidv4(), timestamp: Date.now(),
      });
    }
  }, heartbeatIntervalMs);

  server.listen(port, '0.0.0.0', () => {
    logger.info(`Raw TCP server listening on port ${port}`);
  });

  server.on('error', (err) => {
    logger.error(`TCP server error: ${err.message}`);
  });

  return server;
}

function handleTcpMessage(ctx, payloadBytes, authTimer, logger, clients) {
  let message;
  try {
    message = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    sendMsg(ctx.socket, {
      type: 'ERROR', code: 'INVALID_JSON',
      message: 'Invalid JSON', timestamp: Date.now(),
    });
    return;
  }

  if (message.signature && !verifySignature(message)) {
    sendMsg(ctx.socket, {
      type: 'ERROR', code: 'INVALID_SIGNATURE',
      message: 'Signature verification failed',
      requestId: message.requestId, timestamp: Date.now(),
    });
    return;
  }

  logger.debug(`[TCP:${ctx.clientId}] Received: ${JSON.stringify(message)}`);

  switch (message.type) {
    case 'AUTH':
      handleTcpAuth(ctx, message, authTimer, logger);
      break;

    case 'COMMAND':
      if (!ctx.isAuthenticated) {
        sendMsg(ctx.socket, {
          type: 'ERROR', code: 'NOT_AUTHENTICATED',
          message: 'Send AUTH message first',
          requestId: message.requestId, timestamp: Date.now(),
        });
        return;
      }
      handleCommand({
        clientId:  ctx.clientId,
        command:   message.command,
        requestId: message.requestId ?? '',
        sendFn:    (msg) => sendMsg(ctx.socket, msg),
        logger,
      });
      break;

    case 'PING':
      ctx.isAlive = true;
      sendMsg(ctx.socket, {
        type: 'PONG', requestId: message.requestId, timestamp: Date.now(),
      });
      break;

    case 'PONG':
      ctx.isAlive = true;
      break;

    default:
      sendMsg(ctx.socket, {
        type: 'ERROR', code: 'UNKNOWN_TYPE',
        message: `Unknown type: ${message.type}`,
        requestId: message.requestId, timestamp: Date.now(),
      });
  }
}

function handleTcpAuth(ctx, message, authTimer, logger) {
  if (!message.token) {
    sendMsg(ctx.socket, {
      type: 'ERROR', code: 'NO_TOKEN',
      message: 'token field required in AUTH message',
      requestId: message.requestId, timestamp: Date.now(),
    });
    return;
  }

  try {
    const payload = verifyToken(message.token);
    ctx.isAuthenticated = true;
    ctx.user = payload;
    clearTimeout(authTimer);

    logger.info(`[TCP:${ctx.clientId}] Authenticated — user: ${payload.userId}`);

    sendMsg(ctx.socket, {
      type:      'CONNECTION_ACK',
      clientId:  ctx.clientId,
      message:   'Raw TCP connected and authenticated',
      requestId: message.requestId,
      timestamp: Date.now(),
    });
  } catch (err) {
    logger.warn(`[TCP:${ctx.clientId}] Auth failed: ${err.message}`);
    sendMsg(ctx.socket, {
      type: 'ERROR', code: 'AUTH_FAILED',
      message: `Token invalid: ${err.message}`,
      requestId: message.requestId, timestamp: Date.now(),
    });
    ctx.socket.destroy();
  }
}

/**
 * sendMsg — encode and send a length-prefixed TCP message.
 * [4-byte UINT32 BE payload length][UTF-8 JSON]
 */
function sendMsg(socket, message) {
  if (socket.destroyed || !socket.writable) return;
  try {
    const payload = Buffer.from(JSON.stringify(message), 'utf8');
    const header  = Buffer.alloc(HEADER_SIZE);
    header.writeUInt32BE(payload.length, 0);
    socket.write(Buffer.concat([header, payload]));
  } catch (err) {
    // Socket may have closed between check and write — ignore
  }
}

module.exports = { createTcpServer };
