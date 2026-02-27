// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

/**
 * Sanitize a value for safe log output by stripping newlines and carriage returns.
 * Prevents log injection attacks where user-controlled data could forge log entries.
 * @param {*} val - The value to sanitize
 * @returns {string} Sanitized string safe for logging
 */
function sanitizeLog(val) {
  return String(val == null ? '' : val).replace(/\n|\r/g, '');
}

module.exports = { sanitizeLog };
