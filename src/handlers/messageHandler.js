/**
 * messageHandler.js
 * ─────────────────────────────────────────────────────────────
 * Memproses pesan (command) yang dikirim dari client.
 *
 * Protocol:
 *   Client mengirim JSON dengan format:
 *   {
 *     "requestId": "uuid-v4",      // Untuk korelasi request-response
 *     "command":   "001",          // Kode command
 *     "payload":   { ... }         // Data tambahan (opsional)
 *   }
 *
 *   Server merespons dengan format:
 *   {
 *     "type":       "DATA_RESPONSE",
 *     "requestId":  "uuid-v4",     // Sama dengan request — untuk matching di client
 *     "command":    "001",
 *     "data":       { ... },       // Data hasil command
 *     "timestamp":  1234567890
 *   }
 *
 * Command mapping (sesuai Acceptance Criteria):
 *   "001"  → Kirim data A
 *   "011"  → Kirim data A dan B
 *   "111"  → Kirim data A, B, dan C
 *   "999"  → Command tidak dikenal → error response
 */

'use strict';

// ─── Simulasi "database" data — di production ganti dengan DB/service call ────
const DATA_STORE = {
  A: { id: 'A', name: 'Data Alpha', value: 42,    category: 'primary'   },
  B: { id: 'B', name: 'Data Beta',  value: 99,    category: 'secondary' },
  C: { id: 'C', name: 'Data Gamma', value: 7,     category: 'tertiary'  },
};

/**
 * commandRoutes: Map command code → fungsi handler
 * Setiap handler menerima { command, payload, context } dan mengembalikan
 * objek data yang akan dikirim ke client.
 */
const commandRoutes = {
  // Command "001": kirim hanya Data A
  '001': ({ payload }) => ({
    items:   [DATA_STORE.A],
    matched: ['A'],
    meta:    { requestedBy: payload?.userId ?? 'anonymous' },
  }),

  // Command "011": kirim Data A dan B
  '011': ({ payload }) => ({
    items:   [DATA_STORE.A, DATA_STORE.B],
    matched: ['A', 'B'],
    meta:    { requestedBy: payload?.userId ?? 'anonymous' },
  }),

  // Command "111": kirim semua data
  '111': ({ payload }) => ({
    items:   Object.values(DATA_STORE),
    matched: Object.keys(DATA_STORE),
    meta:    { requestedBy: payload?.userId ?? 'anonymous' },
  }),
};

const MessageHandler = {
  /**
   * handle()
   * Entry point utama. Menerima pesan yang sudah di-parse dari JSON.
   *
   * @param {object} message  - Objek pesan dari client
   * @param {object} context  - { clientId, user } dari koneksi
   * @returns {object}        - Respons yang siap di-JSON-stringify dan dikirim
   */
  handle(message, context) {
    // ── Validasi struktur pesan wajib ──────────────────────────────────────
    if (!message.requestId || typeof message.requestId !== 'string') {
      return errorResponse(null, 'VALIDATION_ERROR', 'requestId is required (string)');
    }
    if (!message.command || typeof message.command !== 'string') {
      return errorResponse(message.requestId, 'VALIDATION_ERROR', 'command is required (string)');
    }

    const { requestId, command, payload = {} } = message;

    // ── Routing ke handler yang sesuai ─────────────────────────────────────
    const handler = commandRoutes[command];

    if (!handler) {
      return errorResponse(requestId, 'UNKNOWN_COMMAND', `Command "${command}" is not recognized`);
    }

    // ── Eksekusi handler ───────────────────────────────────────────────────
    try {
      const data = handler({ command, payload, context });

      return {
        type:      'DATA_RESPONSE',
        requestId,
        command,
        data,
        timestamp: Date.now(),
      };
    } catch (err) {
      return errorResponse(requestId, 'HANDLER_ERROR', err.message);
    }
  },
};

// ─── Helper: format error response ───────────────────────────────────────────
function errorResponse(requestId, code, message) {
  return {
    type:      'ERROR',
    requestId,
    code,
    message,
    timestamp: Date.now(),
  };
}

module.exports = MessageHandler;