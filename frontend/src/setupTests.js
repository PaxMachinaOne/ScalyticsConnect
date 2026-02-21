// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

// Silence noisy warnings in tests globally
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  if (
    (typeof args[0] === 'string' && args[0].includes('React Router Future Flag Warning')) ||
    (typeof args[0] === 'string' && args[0].includes('Warning: Importing directly from "services/authService" is deprecated'))
  ) {
    return;
  }
  originalWarn(...args);
};

console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Warning: `ReactDOMTestUtils.act` is deprecated')) {
    return;
  }
  // Also silence the common Headless UI transition act warning in smoke tests
  if (typeof args[0] === 'string' && args[0].includes('not wrapped in act(...)')) {
    return;
  }
  originalError(...args);
};
