// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Summarization Service
 *
 * Handles the logic for summarizing long chat histories to fit within
 * a model's context window.
 */

// Polyfill for fetch
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
const Model = require('../models/Model');
const { formatPromptForModel } = require('../models/prompting');
const { handleExternalSummarizationRequest } = require('./providers/handler');

const SUMMARIZATION_PROMPT =
  "Concisely summarize the key points, decisions, and unanswered questions from the following conversation excerpt, focusing on information relevant for continuing the chat. Output only the summary text:\n\n";
const TURNS_TO_KEEP_AFTER_SUMMARY = 3;

/**
 * Summarizes a chat history if it's too long.
 * @param {Array<object>} originalMessages - The original message history.
 * @param {object} userSettings - User-specific settings for summarization.
 * @param {number} currentModelId - The ID of the model for the current chat.
 * @param {number} userId - The ID of the user requesting the summarization.
 * @returns {Promise<{newHistory: Array<object>, summaryText: string|null}>}
 */
async function summarizeHistory(originalMessages, userSettings, currentModelId, userId) {
  try {
    const summarizationModel = await Model.findById(currentModelId);

    if (!summarizationModel) {
      console.error(`[SummarizationService] Model ${currentModelId} not found.`);
      return { newHistory: originalMessages, summaryText: null };
    }

    let temperature = 0.4;
    switch (userSettings.summarization_temperature_preset) {
      case 'strict':
        temperature = 0.1;
        break;
      case 'balanced':
        temperature = 0.4;
        break;
      case 'detailed':
        temperature = 0.7;
        break;
    }

    const lastCheckpointIndex = originalMessages
      .map(m => m.role === 'system' && m.content?.startsWith('Summary of earlier conversation:'))
      .lastIndexOf(true);
    const relevant = lastCheckpointIndex >= 0 ? originalMessages.slice(lastCheckpointIndex + 1) : originalMessages;

    const chatMsgs = relevant.filter(m => m.role !== 'system');
    const keepCount = TURNS_TO_KEEP_AFTER_SUMMARY * 2;

    if (chatMsgs.length <= keepCount) {
      return { newHistory: originalMessages, summaryText: null };
    }

    const toSummarize = chatMsgs.slice(0, -keepCount);
    const toKeep = chatMsgs.slice(-keepCount);

    const excerpt = toSummarize.map(m => `${m.role}: ${m.content}`).join('\n');
    const prompt = SUMMARIZATION_PROMPT + excerpt;
    
    let summaryText;

    if (summarizationModel.external_provider_id) {
      // Handle external model summarization
      summaryText = await handleExternalSummarizationRequest({
        model: summarizationModel,
        prompt: prompt,
        userId: userId,
      });
    } else {
      // Handle local model summarization
      const formatted = await formatPromptForModel(summarizationModel.id, [{ role: 'user', content: prompt }]);
      const params = {
        temperature,
        max_tokens: Math.min(512, summarizationModel.context_window / 4),
        stop: ['\nUser:', '\nAssistant:', '<|endoftext|>'],
      };

      const baseUrl = vllmService.getVllmApiUrl(summarizationModel.id);
      if (!baseUrl) {
        console.error(`[SummarizationService] Could not get API endpoint for local model ${summarizationModel.id}. Is it active?`);
        return { newHistory: originalMessages, summaryText: null };
      }
      const url = `${baseUrl}/v1/chat/completions`;
      const res = await fetchApi(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: String(summarizationModel.id),
          messages: [{ role: 'user', content: formatted }],
          ...params,
          stream: false,
        }),
      });

      if (!res.ok) {
        console.error(`[SummarizationService] vLLM error ${res.status}: ${await res.text()}`);
        return { newHistory: originalMessages, summaryText: null };
      }

      const data = await res.json();
      summaryText = data.choices?.[0]?.message?.content;
    }

    if (!summaryText) {
      return { newHistory: originalMessages, summaryText: null };
    }

    const preservedSystem = originalMessages.filter(m => m.role === 'system' && !m.content?.startsWith('Summary of earlier'));
    const newHistory = [...preservedSystem];
    newHistory.push({
      role: 'system',
      content: `Summary of earlier conversation:\n${summaryText.trim()}`,
    });
    newHistory.push(...toKeep);

    return { newHistory, summaryText: summaryText.trim() };
  } catch (err) {
    console.error('[SummarizationService] Error:', err);
    return { newHistory: originalMessages, summaryText: null };
  }
}

module.exports = {
  summarizeHistory,
};
