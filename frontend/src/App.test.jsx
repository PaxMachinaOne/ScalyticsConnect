// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import { render } from '@testing-library/react';
import App from './App';

// Mock ESM-only modules
vi.mock('react-markdown', () => ({
  default: (props) => <div data-testid="react-markdown">{props.children}</div>,
}));

vi.mock('remark-gfm', () => ({ default: () => {} }));
vi.mock('rehype-raw', () => ({ default: () => {} }));
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

vi.mock('react-syntax-highlighter', () => ({
  Prism: (props) => <div data-testid="syntax-highlighter">{props.children}</div>,
}));

vi.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({
  vscDarkPlus: {},
}));

test('renders without crashing', () => {
  render(<App />);
});
