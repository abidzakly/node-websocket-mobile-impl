// server/src/handlers/auth_handler.js
//
// Shared JWT verification used by both WebSocket and Raw TCP handlers.

'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config/config');

/**
 * verifyToken — verify a JWT and return the decoded payload.
 * Throws if invalid or expired.
 *
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

/**
 * signPayload — HMAC-SHA256 signing for payload integrity.
 * Returns hex string signature.
 */
const crypto = require('crypto');

function verifySignature(message) {
  if (!config.HMAC_SECRET) return true;
  const { signature, ...rest } = message;
  if (!signature) return true; // optional

  const sortedJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))
    )
  );

  const expected = crypto
    .createHmac('sha256', config.HMAC_SECRET)
    .update(sortedJson)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected,  'hex')
    );
  } catch {
    return false;
  }
}

module.exports = { verifyToken, verifySignature };
