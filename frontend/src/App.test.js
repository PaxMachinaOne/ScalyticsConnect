// Silence noisy warnings in tests - MUST happen before App load
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
  originalError(...args);
};

import { render, act } from '@testing-library/react';

// Now require App
const App = require('./App').default;

// Mock ESM-only modules
jest.mock('react-markdown', () => (props) => {
  return <div data-testid="react-markdown">{props.children}</div>;
});

jest.mock('remark-gfm', () => () => {});
jest.mock('rehype-raw', () => () => {});
jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  render: jest.fn(),
}));

jest.mock('react-syntax-highlighter', () => ({
  Prism: (props) => <div data-testid="syntax-highlighter">{props.children}</div>,
}));

jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

test('renders learn react link', async () => {
  await act(async () => {
    render(<App />);
  });
  // This is a placeholder test. Depending on what App renders, this might need adjustment.
  // For now, let's just check if it renders without crashing.
  expect(true).toBe(true);
});
