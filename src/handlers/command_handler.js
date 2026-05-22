// server/src/handlers/command_handler.js
//
// Shared command routing logic — identical for both WebSocket and Raw TCP.
// The protocol layer calls handleCommand() and passes a sendFn callback.

'use strict';

const DATA_CATALOG = {
  A: { id: 'A', name: 'Data Alpha',   value: 100, category: 'primary',   description: 'Sensor suhu utama' },
  B: { id: 'B', name: 'Data Beta',    value: 200, category: 'secondary', description: 'Sensor tekanan' },
  C: { id: 'C', name: 'Data Gamma',   value: 300, category: 'tertiary',  description: 'Sensor kelembaban' },
  D: { id: 'D', name: 'Data Delta',   value: 400, category: 'primary',   description: 'Sensor cahaya' },
  E: { id: 'E', name: 'Data Epsilon', value: 500, category: 'secondary', description: 'Sensor gerakan' },
};

const COMMAND_MAP = {
  '001': ['A'],
  '010': ['B'],
  '011': ['A', 'B'],
  '100': ['C'],
  '101': ['A', 'C'],
  '110': ['B', 'C'],
  '111': ['A', 'B', 'C'],
};

/**
 * handleCommand — process a COMMAND message and call sendFn with the response.
 *
 * @param {object}   opts
 * @param {string}   opts.clientId
 * @param {string}   opts.command    — e.g. "011"
 * @param {string}   opts.requestId
 * @param {Function} opts.sendFn     — (message: object) => void
 * @param {object}   opts.logger
 */
function handleCommand({ clientId, command, requestId, sendFn, logger }) {
  const keys = COMMAND_MAP[command];

  if (!keys) {
    logger.warn(`[${clientId}] Unknown command: ${command}`);
    sendFn({
      type:      'ERROR',
      code:      'UNKNOWN_COMMAND',
      message:   `Unknown command: ${command}. Valid: ${Object.keys(COMMAND_MAP).join(', ')}`,
      requestId,
      timestamp: Date.now(),
    });
    return;
  }

  const items = keys.map(k => DATA_CATALOG[k]);
  logger.info(`[${clientId}] CMD ${command} → [${keys.join(', ')}]`);

  sendFn({
    type:      'DATA_RESPONSE',
    requestId,
    command,
    data: {
      items,
      matched:    keys,
      totalCount: items.length,
    },
    timestamp: Date.now(),
  });
}

module.exports = { handleCommand };
