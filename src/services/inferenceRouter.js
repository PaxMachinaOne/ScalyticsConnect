// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Inference Router
 *
 * Determines where to send an inference request based on the model ID.
 * Validates context window limits and handles message history truncation.
 * Routes to appropriate endpoints (vLLM service or external API provider).
 * Includes optional history summarization based on user settings.
 */

// Polyfill for fetch: use global fetch if available (Node 18+), otherwise fallback to node-fetch v2
let fetchApi;
if (typeof global.fetch === 'function') {
  fetchApi = global.fetch.bind(global);
} else {
  try {
    fetchApi = require('node-fetch');
  } catch (err) {
    console.error('Fetch API is unavailable. Please upgrade Node.js to >=18 or install node-fetch@2.');
    throw err;
  }
}

const vllmService = require('./vllmService');
const summarizationService = require('./summarizationService');
const chatService = require('./chatService');
const Message = require('../models/Message');
const Model = require('../models/Model');
const User = require('../models/User');
const { handleExternalApiRequest } = require('./providers/handler');
const {
  formatPromptForModel,
  validateContextForModel,
  truncateHistoryForModel,
} = require('../models/prompting');
const { createParser } = require('eventsource-parser');
const eventBus = require('../utils/eventBus');

/**
 * Validates and fixes message sequence to ensure vLLM compatibility
 * vLLM (especially Gemma) requires clean alternating user/assistant roles
 * This function separates system messages and ensures perfect alternation
 */
function validateAndFixMessageSequence(messages) {
  if (!messages || messages.length === 0) {
    return [];
  }
  
  const systemMessages = messages.filter(m => m.role === 'system');
  const conversationMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  
  const fixed = [];
  
  if (systemMessages.length > 0) {
    const combinedSystemContent = systemMessages.map(m => m.content).join('\n');
    fixed.push({ role: 'system', content: combinedSystemContent });
  }
  
  let expectedNextRole = 'user';
  
  for (let i = 0; i < conversationMessages.length; i++) {
    const msg = conversationMessages[i];
    
    if (msg.role !== expectedNextRole) {
      const placeholderContent = expectedNextRole === 'user'
        ? '[User input missing]'
        : ' ';
      fixed.push({ role: expectedNextRole, content: placeholderContent });
      expectedNextRole = expectedNextRole === 'user' ? 'assistant' : 'user';
    }
    
    fixed.push(msg);
    expectedNextRole = msg.role === 'user' ? 'assistant' : 'user';
  }
  
  return fixed;
}

const CONTEXT_WARNING_THRESHOLD_PERCENT = 85;
const SUMMARIZATION_THRESHOLD_PERCENT = 90;

/**
 * Routes an inference request to the appropriate handler after validating context size
 * and formatting the prompt.
 */
async function routeInferenceRequest(options) {
  const {
    modelId,
    messages,
    parameters,
    onToken,
    userId,
    files,
    streamingContext,
    autoTruncate = true,
    signal, 
  } = options;

  if (!modelId) throw new Error('modelId is required');
  if (!Array.isArray(messages) || messages.length === 0)
    throw new Error('messages array is required');

  try {
    const model = await Model.findById(modelId);
    if (!model) throw new Error(`Model ${modelId} not found.`);

    let processed = messages;
    const chatId = streamingContext?.chatId;
    const originalUserMessage = messages[messages.length - 1];
    let wasSummarized = false;

    if (userId && chatId) {
      try {
        const user = await User.findById(userId);
        if (user?.summarization_enabled) {
          const check = await validateContextForModel(modelId, processed);
          if (check.contextSize && check.estimatedTokens > (check.contextSize * SUMMARIZATION_THRESHOLD_PERCENT) / 100) {
            const settings = {
              summarization_model_id: user.summarization_model_id,
              summarization_temperature_preset: user.summarization_temperature_preset,
            };
            
            const summaryResult = await summarizationService.summarizeHistory(processed, settings, modelId, userId);

            if (summaryResult.summaryText) {
              wasSummarized = true;
              // 1. Persist the new history
              await chatService.replaceChatHistory(chatId, summaryResult.newHistory);
              
              // 2. Create and send the summary message as a *complete* message
              const summaryNotice = {
                role: 'assistant',
                content: `The conversation history is long, so I've created a summary:\n\n${summaryResult.summaryText}`,
                isLoading: false,
              };
              const noticeId = await Message.create({ chat_id: chatId, ...summaryNotice });
              eventBus.publish('chat:complete', {
                chatId: chatId,
                messageId: noticeId,
                message: summaryNotice.content,
                status: 'completed_summary',
                timestamp: new Date().toISOString()
              });
              
              // 3. Set up the 'processed' history for the *actual* user question
              processed = [...summaryResult.newHistory, originalUserMessage];
            }
          }
        }
      } catch (e) {
        console.error('[Router] User settings or summarization fetch error:', e);
      }
    }

    // --- New Context Validation and Max Tokens Calculation ---
    if (!wasSummarized) {
        let validation = await validateContextForModel(modelId, processed);
        if (validation.isTooLong) {
          if (autoTruncate) {
            console.log(`[InferenceRouter] History is too long (${validation.estimatedTokens} >= ${validation.contextSize}). Truncating...`);
            
            const originalMessageCount = processed.length;
            processed = await truncateHistoryForModel(modelId, processed);
            
            // Check if truncation actually happened and notify the user.
            if (processed.length < originalMessageCount && chatId) {
                const truncationNotice = {
                    role: 'system',
                    content: 'Note: To keep our conversation going, some earlier parts of the chat have been summarized to fit within the context limit.',
                    isLoading: false,
                };
                const noticeId = await Message.create({ chat_id: chatId, ...truncationNotice });
                eventBus.publish('chat:new_message', { chatId, message: { id: noticeId, ...truncationNotice } });
            }

            validation = await validateContextForModel(modelId, processed);
            if (validation.isTooLong) {
              throw new Error(`History still exceeds context window (${validation.estimatedTokens} >= ${validation.contextSize}) even after truncation.`);
            }
            console.log(`[InferenceRouter] History truncated. New token count: ${validation.estimatedTokens}`);
          } else {
            throw new Error(`History exceeds context window (${validation.estimatedTokens} >= ${validation.contextSize}) and auto-truncate is disabled.`);
          }
        }
    }


    // --- End New Context Validation ---
    // max_tokens is intentionally removed to allow the model to determine the response length based on the prompt.
    delete parameters.max_tokens;

    // Prepare prompt for model
    let systemContent = null;
    const messagesForFmt = [];
    const sysIdx = processed.findIndex(m => m.role === 'system');
    if (sysIdx !== -1) {
      systemContent = processed[sysIdx].content;
      messagesForFmt.push(...processed.slice(0, sysIdx));
      messagesForFmt.push(...processed.slice(sysIdx + 1));
    } else messagesForFmt.push(...processed);

    const formatted = await formatPromptForModel(
      modelId,
      messagesForFmt,
      systemContent
    );

    // External vs local
    if (model.external_provider_id) {
      return handleExternalApiRequest({
        model,
        prompt: processed[processed.length - 1].content,
        parameters,
        onToken,
        previousMessages: processed.slice(0, -1),
        userId,
        files,
        streamingContext,
      });
    }

    // Local vLLM
    const modelApiUrl = vllmService.getVllmApiUrl(modelId);
    if (!modelApiUrl) {
      throw new Error(
        `Local model ${modelId} is not active or its endpoint is not available.`
      );
    }

    const validatedSeq = validateAndFixMessageSequence(processed);

    // JSON generation tweak
    const lastUser = validatedSeq.filter(m => m.role === 'user').pop();
    const isJson =
      lastUser?.content.includes('JSON') &&
      /CRITICAL|json|response must be/.test(lastUser.content);

    let finalParams = { ...parameters };
    if (isJson) {
      console.log('[InferenceRouter] Applying JSON parameters');
      finalParams = {
        ...parameters,
        temperature: 0.3,
        repetition_penalty: 1.2,
        stop: [
          '<end_of_turn>',
          '<start_of_turn>',
          '\n\nUser:',
          '\n\nAssistant:',
          '</s>',
          '<|endoftext|>',
        ],
      };
    }

    const vllmPayload = {
      model: String(model.id),
      messages: validatedSeq,
      ...finalParams,
      stream: true,
    };

    // Pass the signal directly to the streaming request handler
    return await streamVllmRequest(
      modelApiUrl, // Pass the specific model's URL
      vllmPayload,
      onToken,
      streamingContext,
      signal
    );
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
    throw err;
  }
}

/**
 * Handles the streaming HTTP request to the vLLM server and processes the SSE stream.
 */
async function streamVllmRequest(modelApiUrl, payload, onToken, streamingContext, signal) {
  const url = `${modelApiUrl}/v1/chat/completions`;
  
  // Set a generous timeout to allow for vLLM queueing and model loading
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
    // undici-specific options for timeouts
    bodyTimeout: 600000, // 10 minutes for the body to start streaming
    headersTimeout: 600000, // 10 minutes for headers
  };

  const response = await fetchApi(url, requestOptions);

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`vLLM API error (${response.status}): ${errBody}`);
  }

  // Return a promise that resolves with the final result of the stream
  return new Promise((resolve, reject) => {
    let fullContent = '';
    let usage = null;

    const onParse = (event) => {
      if (event.type === 'event') {
        if (event.data === '[DONE]') {
          // Stream finished
          return;
        }
        try {
          const json = JSON.parse(event.data);
          const token = json.choices?.[0]?.delta?.content || '';
          if (token) {
            fullContent += token;
            if (onToken) {
              onToken(token);
            }
          }
          if (json.usage) {
            usage = json.usage;
          }
        } catch (e) {
        }
      }
    };

    const parser = createParser(onParse);

    const decoder = new TextDecoder();
    
    const processStream = async () => {
      try {
        for await (const chunk of response.body) {
          if (signal?.aborted) {
            console.log('[streamVllmRequest] Stream processing aborted by signal.');
            throw new Error('AbortError');
          }
          const chunkStr = decoder.decode(chunk, { stream: true });
          parser.feed(chunkStr);
        }
        parser.reset();
        resolve({ message: fullContent, usage });
      } catch (error) {
        if (error.name === 'AbortError') {
           console.log('[streamVllmRequest] Stream aborted.');
           resolve({ message: fullContent, usage, aborted: true });
        } else {
           console.error('[streamVllmRequest] Stream processing error:', error);
           reject(error);
        }
      }
    };
    
    processStream();

    if (signal) {
      signal.addEventListener('abort', () => {
      });
    }
  });
}

module.exports = {
  routeInferenceRequest,
};
