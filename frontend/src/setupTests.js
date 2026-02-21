// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

// Silence noisy warnings in tests globally
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (message, ...optionalParams) => {
  // Silence specific known warnings
  if (typeof message === 'string' && 
      (message.includes('React Router Future Flag Warning') ||
       message.includes('Warning: Importing directly from "services/authService" is deprecated'))) {
    return;
  }
  
  // codeql[js/clear-text-logging] - Test environment wrapper
  originalWarn(message, ...optionalParams);
};

console.error = (message, ...optionalParams) => {
  // Silence specific known warnings
  if (typeof message === 'string' && 
      (message.includes('Warning: `ReactDOMTestUtils.act` is deprecated') ||
       message.includes('not wrapped in act(...)'))) {
    return;
  }
  
  // For other errors, call the original logger
  // codeql[js/clear-text-logging] - This is a test environment utility to silence noisy but expected warnings
  originalError(message, ...optionalParams);
};
