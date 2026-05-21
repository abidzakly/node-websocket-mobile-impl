
/**
 * heartbeatManager.js
 * ─────────────────────────────────────────────────────────────
 * Mengelola mekanisme ping-pong WebSocket untuk mendeteksi
 * koneksi "zombie" — client yang sudah mati tapi tidak menutup
 * koneksi secara eksplisit (misal: mobile kehilangan sinyal tiba-tiba).
 *
 * Cara kerja:
 * 1. Setiap INTERVAL, server mengirim ping ke semua client
 * 2. Client yang masih hidup akan otomatis membalas pong (built-in WS spec)
 * 3. Sebelum ping berikutnya, cek isAlive:
 *    - false → client tidak merespons → terminate koneksi
 *    - true  → reset ke false, kirim ping berikutnya
 *
 * Siklus:
 *   Server set isAlive=false → kirim ping
 *   Client balas pong → handler set isAlive=true
 *   Interval berikutnya → cek: masih hidup? ya → lanjut, tidak → kill
 */

'use strict';

const WebSocket = require('ws');
const logger    = require('./logger');

const HeartbeatManager = {
  /**
   * start()
   * Mulai interval heartbeat.
   *
   * @param {Map}    clients   - Map<clientId, { ws, user, isAlive }>
   * @param {number} intervalMs - Interval antar ping dalam milidetik
   */
  start(clients, intervalMs) {
    setInterval(() => {
      clients.forEach((client, clientId) => {
        // Jika tidak merespons ping sebelumnya → zombie → terminasi
        if (!client.isAlive) {
          logger.warn(`Heartbeat: terminating zombie client ${clientId}`);
          client.ws.terminate();   // terminate() lebih kuat dari close()
          clients.delete(clientId);
          return;
        }

        // Reset flag, lalu kirim ping
        client.isAlive = false;

        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      });

      logger.debug(`Heartbeat: ${clients.size} active connections`);
    }, intervalMs);

    logger.info(`Heartbeat manager started (interval: ${intervalMs}ms)`);
  },
};

module.exports = HeartbeatManager;