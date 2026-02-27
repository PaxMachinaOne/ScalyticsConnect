// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const path = require('path');
const { db } = require('../models/db');
const Model = require('../models/Model');
const eventBus = require('../utils/eventBus');
const modelPoolManager = require('./modelPoolManager');

class VLLMService {
    constructor() {
    }

    detectModelFamily(modelPath) {
        const modelName = modelPath.toLowerCase();
        
        if (modelName.includes('gpt') || modelName.includes('openai')) {
            return 'gpt';
        } else if (modelName.includes('mistral') && modelName.includes('3.1')) {
            return 'mistral3.1';
        } else if (modelName.includes('mistral')) {
            return 'mistral';
        } else if (modelName.includes('llama') || modelName.includes('meta-llama')) {
            return 'llama';
        } else if (modelName.includes('gemma')) {
            return 'gemma';
        } else if (modelName.includes('deepseek')) {
            return 'deepseek';
        } else if (modelName.includes('phi')) {
            return 'phi';
        }
        
        return 'generic';
    }

    async initialize() {
        console.log('[vLLMService] Initializing...');
        await modelPoolManager.initialize();
        
        try {
            const activeModels = await db.allAsync('SELECT id FROM models WHERE is_active = 1 AND external_provider_id IS NULL');
            if (activeModels && activeModels.length > 0) {
                console.log('[vLLMService] Found %s model(s) to activate on startup.', activeModels.length);
                for (const model of activeModels) {
                    this.activateModel(model.id).catch(err => {
                        console.error('[vLLMService] Error during startup activation for model %s:', model.id, err.message);
                    });
                }
            }
        } catch (error) {
            console.error('[vLLMService] Failed to query for active models on startup:', error);
        }

        console.log('[vLLMService] Service initialization completed.');
    }

    async activateModel(modelId, providedActivationId = null) {
        const activationId = providedActivationId || `activation-${modelId}-${Date.now()}`;
        
        const model = await Model.findById(modelId);
        if (!model || model.model_format !== 'torch') {
            throw new Error('Cannot activate a non-torch model with vLLM.');
        }

        if (model.is_embedding_model) {
            const errorMessage = `[vLLMService] Attempted to activate an embedding model (ID: ${modelId}, Name: ${model.name}) with vLLM, which is not supported.`;
            console.error(errorMessage);
            eventBus.publish('activation:error', activationId, {
                error: 'This model is an embedding model and cannot be run with vLLM.',
                modelId: modelId,
                modelName: model.name
            });
            throw new Error(errorMessage);
        }

        eventBus.publish('activation:start', activationId, {
            modelId,
            modelName: model.name,
            progress: 0,
            message: 'Preparing model activation...',
            step: 'preparation'
        });

        const onDiskConfig = model.model_path ? require('../utils/vramCalculator').readModelConfig(model.model_path) : null;
        let dbConfig = {};
        if (model.config) {
            try {
                dbConfig = JSON.parse(model.config);
            } catch (e) {
                console.error('[vLLMService] Error parsing DB config for %s:', model.name, e);
            }
        }
        const finalConfig = { ...onDiskConfig, ...dbConfig };
        const onDiskQuantization = model.quantization_method || 'none';
        const desiredPrecision = finalConfig.model_precision || 'auto';
        const onDiskDtype = finalConfig.dtype || finalConfig.torch_dtype || 'auto';
        let quantizationArg = 'none';
        let dtypeArg = onDiskDtype;

        if (onDiskQuantization && onDiskQuantization !== 'none') {
            quantizationArg = onDiskQuantization;
            dtypeArg = 'auto'; 
        }
        else if (desiredPrecision && desiredPrecision !== 'auto') {
        }
        
        let actualContext;
        let familyOptimizations = {};

        const optimizedConfig = { ...familyOptimizations, ...finalConfig };
        
        if (familyOptimizations.dtype) dtypeArg = familyOptimizations.dtype;
        if (familyOptimizations.quantization && familyOptimizations.quantization !== quantizationArg) {
            // familyOptimizations.quantization takes precedence
        }
        actualContext = familyOptimizations.max_model_len;

        const pythonWrapperPath = path.join(__dirname, '../../scripts/python-wrapper.sh');
        const vllmScriptPath = path.join(__dirname, '../../scripts/start_vllm.py');
        
        const tensorParallelSize = optimizedConfig.tensor_parallel_size ? String(optimizedConfig.tensor_parallel_size) : '1';
        
        const args = [
            vllmScriptPath,
            '--model', model.model_path,
            '--tensor-parallel-size', tensorParallelSize,
            '--served-model-name', String(model.id),
            '--dtype', dtypeArg,
            '--max-num-seqs', '16',
        ];

        if (actualContext) {
            args.push('--max-model-len', String(actualContext));
        }

        console.log('[vLLMService] vLLM command prepared: %s %s', pythonWrapperPath, args.join(' '));

        try {
            const tensorParallelSizeNum = parseInt(tensorParallelSize, 10);            
            await db.runAsync('UPDATE models SET tensor_parallel_size = ? WHERE id = ?', [tensorParallelSizeNum, modelId]);
            await modelPoolManager.startModel(modelId, 0, pythonWrapperPath, args, tensorParallelSizeNum, activationId);
            console.log('[vLLMService] Model %s activation initiated.', model.name);            
            return { success: true, message: `Model ${model.name} activation started`, activationId };
        } catch (error) {
            console.error('[vLLMService] Error activating model via pool manager: %s', error.message);
            eventBus.publish('activation:error', activationId, {
                error: error.message,
                modelId: modelId,
                modelName: model.name
            });
            throw error; 
        }
    }

    async deactivateModel(modelId, gpuId = 0) {
        console.log("[vLLMService] Deactivating model %s on GPU %s...", String(modelId).replace(/\n|\r/g, ''), gpuId);
        await modelPoolManager.stopModel(modelId, gpuId);
        await db.runAsync('UPDATE models SET is_active = 0, assigned_gpu_id = 0 WHERE id = ?', [modelId]);
        console.log("[vLLMService] Model %s marked as inactive.", String(modelId).replace(/\n|\r/g, ''));
    }

    /**
     * Gets the API endpoint for a given model from the pool manager.
     * @param {string} modelId - The ID of the model.
     * @returns {string|null} The full URL (e.g., http://localhost:8010) or null.
     */
    getVllmApiUrl(modelId) {
        const endpoint = modelPoolManager.getModelEndpoint(modelId, 0);
        if (endpoint) {
            return `http://${endpoint.host}:${endpoint.port}`;
        }
        return null;
    }

    async shutdown() {
        console.log('[vLLMService] Shutting down vLLM service...');
        await modelPoolManager.shutdown();
    }
}

const vllmService = new VLLMService();
module.exports = vllmService;
