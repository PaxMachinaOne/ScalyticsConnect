// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

/**
 * URL validation utilities for SSRF protection.
 */

/**
 * Validates and returns a sanitized internal service URL.
 * Parses with new URL() to prevent protocol/host injection.
 *
 * @param {string} baseUrl - The base URL from system settings
 * @param {string} [path] - The path to append (e.g., '/vector/embed-texts')
 * @returns {string} The validated full URL
 * @throws {Error} If the URL is invalid or uses a non-HTTP protocol
 */
function validateInternalServiceUrl(baseUrl, path = '') {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new Error('Service URL is not configured.');
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (e) {
    throw new Error(`Invalid service URL: ${baseUrl}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Invalid protocol in service URL: ${parsed.protocol}`);
  }

  if (path) {
    const safePath = path.startsWith('/') ? path : `/${path}`;
    parsed.pathname = parsed.pathname.replace(/\/$/, '') + safePath;
  }

  return parsed.toString();
}

/**
 * Sanitizes a path segment for use in external API URLs.
 * Prevents path traversal and injection attacks.
 *
 * @param {string} segment - A path segment (e.g., owner, repo, modelId)
 * @returns {string} The sanitized segment
 * @throws {Error} If the segment contains dangerous patterns
 */
function sanitizePathSegment(segment) {
  if (!segment || typeof segment !== 'string') {
    throw new Error('Path segment is required and must be a string.');
  }

  if (segment.includes('..')) {
    throw new Error('Invalid path segment: contains traversal patterns.');
  }

  if (/[\x00-\x1f\x7f]/.test(segment)) {
    throw new Error('Invalid path segment: contains control characters.');
  }

  return segment.split('/').map(part => encodeURIComponent(part)).join('/');
}

/**
 * Validates an external API URL by parsing it and checking the hostname.
 *
 * @param {string} url - The full URL to validate
 * @param {string} expectedHostname - The expected hostname (e.g., 'api.search.brave.com')
 * @param {string} fallbackUrl - The fallback URL if validation fails
 * @returns {string} The validated URL or the fallback
 */
function validateProviderUrl(url, expectedHostname, fallbackUrl) {
  if (!url || typeof url !== 'string') {
    return fallbackUrl;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === expectedHostname ||
        parsed.hostname.endsWith(`.${expectedHostname}`)) {
      return url;
    }
  } catch (e) {
    // Invalid URL, fall through to fallback
  }

  return fallbackUrl;
}

module.exports = {
  validateInternalServiceUrl,
  sanitizePathSegment,
  validateProviderUrl,
};
