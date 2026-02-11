// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * VRAM Calculator
 * 
 * This utility provides functions to estimate the VRAM required to load a given
 * language model. It works by reading the model's configuration file to
 * determine its architecture (number of parameters, etc.) and then calculating
 * the memory footprint based on the desired precision (e.g., fp16, int8, int4).
 */
const fs = require('fs');
const path = require('path');

/**
 * Reads the config.json file from a model directory.
 * @param {string} modelPath - The path to the model directory.
 * @returns {object|null} The parsed JSON configuration or null if not found.
 */
function readModelConfig(modelPath) {
    const configPath = path.join(modelPath, 'config.json');
    if (fs.existsSync(configPath)) {
        try {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(configContent);
        } catch (error) {
            console.error(`[VramCalculator] Error reading or parsing config.json at ${configPath}:`, error);
            return null;
        }
    }
    return null;
}

/**
 * Estimates the VRAM required for a model.
 * @param {object} modelConfig - The model's parsed config.json content.
 * @param {string} precision - The target precision ('fp16', 'bfloat16', 'int8', 'int4').
 * @returns {number} Estimated VRAM in MiB.
 */
function estimateVram(modelConfig, precision = 'fp16') {
    if (!modelConfig) {
        // Return a default high value if config is missing, to be safe.
        return 20000; // 20GB
    }

    // For multimodal models, the main LLM config might be nested.
    const effectiveConfig = modelConfig.text_config || modelConfig;

    // Find the total number of parameters. This can be under various keys.
    const numParameters = modelConfig.num_parameters 
                          || modelConfig.num_total_parameters 
                          || (effectiveConfig.hidden_size && effectiveConfig.num_hidden_layers ? calculateParams(effectiveConfig) : 0);

    if (numParameters === 0) {
        console.warn('[VramCalculator] Could not determine number of parameters from model config.');
        return 20000; // Fallback
    }

    let bytesPerParam;
    switch (precision) {
        case 'fp16':
        case 'bfloat16':
            bytesPerParam = 2;
            break;
        case 'int8':
            bytesPerParam = 1;
            break;
        case 'int4':
            bytesPerParam = 0.5;
            break;
        default:
            bytesPerParam = 2; // Default to fp16
    }

    // Base VRAM for weights
    const baseVramBytes = numParameters * bytesPerParam;

    // Add overhead for KV cache, activations, and framework.
    // This is a rough estimation; a more complex model would be needed for high accuracy.
    // A common rule of thumb is to add 20-40% overhead.
    const overheadFactor = 1.3;
    const totalVramBytes = baseVramBytes * overheadFactor;

    // Convert bytes to MiB
    const totalVramMib = totalVramBytes / (1024 * 1024);

    return Math.ceil(totalVramMib);
}

/**
 * A helper to roughly calculate parameters if not explicitly provided.
 * This is a simplification and may not be accurate for all architectures.
 */
function calculateParams(config) {
    // This is a very rough heuristic and should be improved.
    const hidden_size = config.hidden_size || config.d_model;
    const num_hidden_layers = config.num_hidden_layers || config.n_layer;
    const intermediate_size = config.intermediate_size || config.ffn_dim;
    const vocab_size = config.vocab_size || 32000;

    if (hidden_size && num_hidden_layers && intermediate_size) {
        // A very rough approximation for a transformer model
        const embeddingParams = hidden_size * vocab_size;
        const attentionParams = num_hidden_layers * (4 * hidden_size * hidden_size);
        const ffnParams = num_hidden_layers * (2 * hidden_size * intermediate_size);
        return embeddingParams + attentionParams + ffnParams;
    }
    return 0;
}


/**
 * Main exported function to calculate VRAM requirement for a model object.
 * @param {object} model - The model object from the database, potentially enriched with file info.
 * @returns {number|null} Estimated VRAM in GiB, or null if not determinable.
 */
function calculateVRAMRequirement(model) {
    // Only calculate for local models with a valid path
    if (!model || !model.model_path || model.external_provider_id) {
        return null;
    }

    const modelConfig = readModelConfig(model.model_path);
    
    if (!modelConfig) {
        // Fallback to estimating based on file size if config is missing
        const fileSizeGb = model.file_size ? model.file_size / (1024 * 1024 * 1024) : null;
        if (fileSizeGb) {
            // A common heuristic: VRAM needed is ~1.5x to 2x the model's file size.
            // We'll use a conservative factor of 1.8.
            return Math.ceil(fileSizeGb * 1.8);
        }
        // Cannot determine VRAM without config or file size
        return null;
    }

    // If we have the config, use the more accurate estimation
    const vramMib = estimateVram(modelConfig);
    // Convert MiB to GiB for the final output
    return Math.ceil(vramMib / 1024);
}

module.exports = {
    readModelConfig,
    estimateVram,
    calculateVRAMRequirement,
};
