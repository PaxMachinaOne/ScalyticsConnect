// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

// Mock global fetch BEFORE requiring the service
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    body: (async function* () {
      yield Buffer.from('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
      yield Buffer.from('data: [DONE]\n\n');
    })(),
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({}),
  })
);

// Mock dependencies
jest.mock('../src/models/db', () => ({
  db: {
    getAsync: jest.fn(),
    allAsync: jest.fn(),
    runAsync: jest.fn(),
    execAsync: jest.fn(),
  },
  initializeDatabase: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/models/Model');
jest.mock('../src/models/Message');
jest.mock('../src/models/User');
jest.mock('../src/services/summarizationService');
jest.mock('../src/services/chatService');
jest.mock('../src/services/vllmService', () => ({
  getVllmApiUrl: jest.fn().mockReturnValue('http://localhost:8000')
}));
jest.mock('../src/services/providers/handler', () => ({
  handleExternalApiRequest: jest.fn()
}));
jest.mock('../src/models/prompting', () => ({
  formatPromptForModel: jest.fn().mockResolvedValue('formatted prompt'),
  validateContextForModel: jest.fn().mockResolvedValue({ isTooLong: false, estimatedTokens: 100, contextSize: 4096 }),
  truncateHistoryForModel: jest.fn().mockImplementation((id, msgs) => Promise.resolve(msgs)),
}));

const { routeInferenceRequest } = require('../src/services/inferenceRouter');
const Model = require('../src/models/Model');

describe('Inference Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routeInferenceRequest should correctly route to local vLLM', async () => {
    Model.findById.mockResolvedValue({
      id: 1,
      name: 'test-model',
      is_active: 1
    });

    const options = {
      modelId: 1,
      messages: [{ role: 'user', content: 'hi' }],
      parameters: {},
      streamingContext: { chatId: 123, messageId: 456 }
    };

    const result = await routeInferenceRequest(options);
    expect(result.message).toBe('Hello');
  });

  test('validateAndFixMessageSequence (via routeInferenceRequest) should fix non-alternating roles', async () => {
    Model.findById.mockResolvedValue({
      id: 1,
      name: 'test-model',
      is_active: 1
    });

    const options = {
      modelId: 1,
      messages: [
        { role: 'user', content: 'first' },
        { role: 'user', content: 'second' }
      ],
      parameters: {},
      streamingContext: { chatId: 123, messageId: 456 }
    };

    const result = await routeInferenceRequest(options);
    expect(result.message).toBe('Hello');
    expect(global.fetch).toHaveBeenCalled();
    
    const fetchArgs = global.fetch.mock.calls[0][1];
    const payload = JSON.parse(fetchArgs.body);
    expect(payload.messages.length).toBe(3);
    expect(payload.messages[0].role).toBe('user');
    expect(payload.messages[1].role).toBe('assistant');
    expect(payload.messages[2].role).toBe('user');
  });
});
