// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

const { APIError, UserCancelledError } = require('../src/utils/errorUtils');

describe('errorUtils', () => {
  test('APIError sets message, statusCode and name', () => {
    const err = new APIError('boom', 418);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('boom');
    expect(err.statusCode).toBe(418);
    expect(err.name).toBe('APIError');
  });

  test('APIError defaults statusCode to 500', () => {
    const err = new APIError('default');
    expect(err.statusCode).toBe(500);
  });

  test('UserCancelledError has default message and name', () => {
    const err = new UserCancelledError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Operation cancelled by user.');
    expect(err.name).toBe('UserCancelledError');
  });
});
