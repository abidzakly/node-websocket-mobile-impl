/**
 * ============================================================
 * WebSocket Server — Production-Ready Implementation
 * ============================================================
 *
 * Teknologi: Node.js + ws library
 *
 * Fitur utama:
 * - Raw TCP socket layer (ws library di atas net module Node.js)
 * - JSON encode/decode untuk payload
 * - Autentikasi via JWT pada handshake
 * - Command-based response: client kirim command code, server balas data
 * - Heartbeat / ping-pong untuk deteksi koneksi mati
 * - Logging struktural
 *
 * Flow koneksi:
 *   Client → WS Handshake (dengan token) → Server validasi JWT
 *   → Jika valid: koneksi diterima, server kirim ACK
 *   → Client kirim command JSON → Server proses → Server kirim respons JSON
 *   → Heartbeat setiap 30 detik untuk menjaga koneksi
 */

'use strict';

const WebSocket = require('ws');
const http      = require('http');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const config          = require('./config/config');
const MessageHandler  = require('./src/handlers/messageHandler');
const HeartbeatManager = require('./src/utils/heartbeatManager');
const logger          = require('./src/utils/logger');

// ─── HTTP Server (dibutuhkan agar wss dapat diattach) ─────────────────────────
const httpServer = http.createServer((req, res) => {
  // Health check endpoint — berguna untuk load balancer / uptime monitor
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({
  server: httpServer,

  /**
   * verifyClient: Berjalan SEBELUM koneksi WebSocket dibuka (saat HTTP upgrade).
   * Ini adalah layer pertama keamanan — validasi JWT token dari header.
   *
   * Token dikirim via query parameter: ws://host?token=<JWT>
   * (Alternatif: header Authorization, tapi browser native WS tidak mendukung custom header)
   */
  verifyClient: (info, callback) => {
    try {
      const url    = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token  = url.searchParams.get('token');

      if (!token) {
        logger.warn('Connection rejected: no token provided');
        return callback(false, 401, 'Unauthorized: token required');
      }

      // Verifikasi signature dan expiry JWT
      const payload = jwt.verify(token, config.JWT_SECRET);
      // Simpan payload di request agar bisa diakses di event 'connection'
      info.req.user = payload;

      callback(true);
    } catch (err) {
      logger.warn(`Connection rejected: invalid token — ${err.message}`);
      callback(false, 401, 'Unauthorized: invalid token');
    }
  },
});

// ─── Menyimpan semua client aktif ─────────────────────────────────────────────
// Map<clientId, { ws, user, isAlive }>
const clients = new Map();

// ─── Event: Koneksi baru diterima ─────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();          // ID unik per sesi koneksi
  const user     = req.user;          // Payload JWT yang sudah divalidasi

  // Simpan ke registry
  clients.set(clientId, { ws, user, isAlive: true });

  logger.info(`Client connected: ${clientId} | user: ${user.userId}`);

  // Kirim ACK ke client setelah koneksi berhasil
  sendToClient(ws, {
    type:      'CONNECTION_ACK',
    clientId,
    message:   'Connected successfully',
    timestamp: Date.now(),
  });

  // ── Event: Pesan masuk dari client ─────────────────────────────────────────
  ws.on('message', (rawData) => {
    try {
      // Decode JSON dari buffer/string yang diterima
      const message = JSON.parse(rawData.toString());

      logger.debug(`[${clientId}] Received: ${JSON.stringify(message)}`);

      // Delegasi ke MessageHandler untuk memproses command
      const response = MessageHandler.handle(message, { clientId, user });

      // Kirim respons kembali ke client yang sama
      sendToClient(ws, response);

    } catch (err) {
      // Kirim error response jika JSON tidak valid atau handler gagal
      logger.error(`[${clientId}] Message error: ${err.message}`);
      sendToClient(ws, {
        type:    'ERROR',
        code:    'INVALID_MESSAGE',
        message: err.message,
        timestamp: Date.now(),
      });
    }
  });

  // ── Event: Heartbeat pong diterima ─────────────────────────────────────────
  ws.on('pong', () => {
    const client = clients.get(clientId);
    if (client) client.isAlive = true;  // Tandai masih hidup
  });

  // ── Event: Koneksi ditutup ─────────────────────────────────────────────────
  ws.on('close', (code, reason) => {
    clients.delete(clientId);
    logger.info(`Client disconnected: ${clientId} | code: ${code} | reason: ${reason}`);
  });

  // ── Event: Error pada koneksi ──────────────────────────────────────────────
  ws.on('error', (err) => {
    logger.error(`[${clientId}] Socket error: ${err.message}`);
    clients.delete(clientId);
  });
});

// ─── Fungsi helper: kirim JSON ke satu client ────────────────────────────────
function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ─── Heartbeat: deteksi koneksi zombie ───────────────────────────────────────
// Setiap interval, ping semua client. Yang tidak membalas (isAlive=false)
// dianggap mati dan koneksinya di-terminate.
HeartbeatManager.start(clients, config.HEARTBEAT_INTERVAL_MS);

// ─── Mulai server ─────────────────────────────────────────────────────────────
httpServer.listen(config.PORT, () => {
  logger.info(`WebSocket server running on ws://localhost:${config.PORT}`);
  logger.info(`Health check: http://localhost:${config.PORT}/health`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server...');
  wss.close(() => {
    httpServer.close(() => process.exit(0));
  });
});