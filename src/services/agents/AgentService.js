// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
// Removed routeInferenceRequest as analysis is now internal to SDK worker
// Removed EmbeddingService import as it's not directly used here anymore for deep search logic
// const { embeddingWorkerService } = require('../embeddingWorkerService'); // Removed as the service file was deleted
// Removed imports specific to old runDeepSearchWorkflow:
// const fs = require('fs/promises');
// const pdf = require('pdf-parse');
// const mammoth = require("mammoth");
// const path = require('path');
// const Model = require('../../models/Model');
// const apiKeyService = require('../apiKeyService');
// TODO: Import litellm wrapper or PoolMgrService if needed for LLM calls elsewhere?
// const poolMgrService = require('../poolMgrService');
// const litellm = require('../../utils/litellm');

// Cancellation logic moved to src/utils/cancellationManager.js

// Removed unused functions
// async function getUserApiKey(userId, serviceName) { /* ... */ }
// async function executeAiAnalysis(modelId, prompt, isAirGapped = false) { /* ... */ }

// Removed runDeepSearchWorkflow as it's now an MCP tool

module.exports = {
    // No functions exported from here currently related to deep search or cancellation
};
