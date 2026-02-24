// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const { db } = require('../models/db');
const Model = require('../models/Model');
const { writeModelConfigJson } = require('../utils/modelConfigUtils');
const vllmService = require('../services/vllmService');
const { triggerPythonServiceRestart, handleEmbeddingModelChange } = require('../utils/pythonServiceUtils');
const { sanitizePathSegment } = require('../utils/urlValidation');

exports.getModels = async (req, res) => {
  try {
    let models = await Model.getAll();

    if (req.shouldFilterModels && req.user && !req.user.is_admin) {
      const accessibleModelIds = await db.allAsync(`
        SELECT DISTINCT m.id
        FROM models m
        JOIN group_model_access gma ON m.id = gma.model_id
        JOIN user_groups ug ON gma.group_id = ug.group_id
        WHERE ug.user_id = ?
        AND gma.can_access = 1
      `, [req.user.id]);

      const accessibleIds = new Set(accessibleModelIds.map(m => m.id));
      models = models.filter(model => accessibleIds.has(model.id));
    }

    const processedModels = models.map(model => {
      return { ...model };
    });


    res.status(200).json({
      success: true,
      count: processedModels.length,
      data: processedModels
    });
  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching models'
    });
  }
};

exports.getActiveModelsForUser = async (req, res) => {
  try {
    let models = [];
    let isPrivacyModeEnabled = false;

    try {
      const privacyMode = await db.getAsync(
        'SELECT value FROM system_settings WHERE key = ?',
        ['global_privacy_mode']
      );

      isPrivacyModeEnabled = privacyMode && privacyMode.value === 'true';
    } catch (privacyError) {
      console.error('Error checking privacy mode:', privacyError);
    }

    try {
      if (typeof Model.getActiveForUser === 'function' && !isPrivacyModeEnabled) {
        models = await Model.getActiveForUser(req.user.id);
      } else {
        console.error('Using fallback query - either getActiveForUser is not a function or privacy mode is enabled');
        let baseQuery;
        if (isPrivacyModeEnabled) {
          if (req.user.is_admin) {
            baseQuery = `SELECT * FROM models m WHERE m.is_active = 1 AND m.external_provider_id IS NULL AND (m.is_embedding_model IS NULL OR m.is_embedding_model = 0) ORDER BY m.name ASC`;
            models = await db.allAsync(baseQuery);
          } else {
            baseQuery = `SELECT DISTINCT m.* FROM models m JOIN group_model_access gma ON m.id = gma.model_id JOIN user_groups ug ON gma.group_id = ug.group_id WHERE ug.user_id = ? AND gma.can_access = 1 AND m.is_active = 1 AND m.external_provider_id IS NULL AND (m.is_embedding_model IS NULL OR m.is_embedding_model = 0) ORDER BY m.name ASC`;
            models = await db.allAsync(baseQuery, [req.user.id]);
          }
        } else {
          if (req.user.is_admin) {
            baseQuery = `SELECT * FROM models m WHERE m.is_active = 1 AND (m.is_embedding_model IS NULL OR m.is_embedding_model = 0) ORDER BY m.name ASC`;
            models = await db.allAsync(baseQuery);
          } else {
            baseQuery = `SELECT DISTINCT m.* FROM models m JOIN group_model_access gma ON m.id = gma.model_id JOIN user_groups ug ON gma.group_id = ug.group_id WHERE ug.user_id = ? AND gma.can_access = 1 AND m.is_active = 1 AND (m.is_embedding_model IS NULL OR m.is_embedding_model = 0) ORDER BY m.name ASC`;
            models = await db.allAsync(baseQuery, [req.user.id]);
          }
        }
        for (const model of models) {
          if (model.external_provider_id) {
            const provider = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [model.external_provider_id]);
            if (provider) model.provider_name = provider.name;
          }
          model.can_use = true;
        }
      }
    } catch (modelError) {
      console.error('Error getting models from Model.getActiveForUser:', modelError);
      models = []; 
    }

    const processedModels = models.map(model => {
      const newModelObject = {
        id: model.id,
        name: model.name,
        description: model.description,
        model_path: model.model_path,
        context_window: model.context_window,
        is_active: model.is_active,
        external_provider_id: model.external_provider_id,
        external_model_id: model.external_model_id,
        huggingface_repo: model.huggingface_repo,
        model_family: model.model_family,
        prompt_format_type: model.prompt_format_type,
        tokenizer_repo_id: model.tokenizer_repo_id,
        is_default: model.is_default,
        provider: model.provider,
        config: model.config,
        default_system_prompt: model.default_system_prompt,
        size_bytes: model.size_bytes,
        enable_scala_prompt: model.enable_scala_prompt,
        preferred_cache_type: model.preferred_cache_type,
        is_embedding_model: model.is_embedding_model,
        can_generate_images: model.can_generate_images,
        raw_capabilities_info: model.raw_capabilities_info,
        created_at: model.created_at,
        updated_at: model.updated_at,
        ...(model.file_size_formatted && { file_size_formatted: model.file_size_formatted }),
        ...(model.estimatedVramGb !== undefined && { estimatedVramGb: model.estimatedVramGb }),
        ...(model.embedding_dimension && { embedding_dimension: model.embedding_dimension }),
        ...(model.provider_name && { provider_name: model.provider_name }), 
        ...(model.can_use !== undefined && { can_use: model.can_use }), 
        ...(model.is_preferred_embedding !== undefined && { is_preferred_embedding: model.is_preferred_embedding }),
        ...(model.access_source && { access_source: model.access_source }), 
      };
      return newModelObject;
    });

    res.status(200).json({
      success: true,
      count: processedModels.length,
      data: processedModels,
      privacyModeEnabled: isPrivacyModeEnabled
    });
  } catch (error) { 
    console.error('Get active models for user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active models for user: ' + (error.message || 'Unknown error')
    });
  }
};

exports.getModel = async (req, res) => {
  try {
    const model = await Model.findById(req.params.id);
    if (!model) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }
    res.status(200).json({ success: true, data: model });
  } catch (error) {
    console.error('Get model error:', error);
    res.status(500).json({ success: false, message: 'Error fetching model' });
  }
};

async function getEmbeddingDimensionFromHuggingFace(repoId) {
  if (!repoId) return null;
  const configUrl = `https://huggingface.co/${sanitizePathSegment(repoId)}/raw/main/config.json`;
  return new Promise((resolve) => {
    https.get(configUrl, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`[HF Config Fetch] Failed to fetch ${configUrl}. Status: ${res.statusCode}`);
        resolve(null);
        return;
      }
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const hfConfig = JSON.parse(rawData);
          const dimension = hfConfig.hidden_size || hfConfig.d_model || hfConfig.hidden_dim || hfConfig.embedding_dim || hfConfig.dimension;
          if (dimension && typeof dimension === 'number' && dimension > 0) {
            console.log('[HF Config Fetch] Found dimension %s for %s', dimension, repoId);
            resolve(dimension);
          } else {
            console.warn('[HF Config Fetch] Dimension not found or invalid in config for %s. Config:', repoId, hfConfig);
            resolve(null);
          }
        } catch (e) {
          console.error('[HF Config Fetch] Error parsing config.json for %s:', repoId, e);
          resolve(null);
        }
      });
    }).on('error', (e) => {
      console.error('[HF Config Fetch] Error fetching config.json for %s:', repoId, e);
      resolve(null);
    });
  });
}

exports.addModel = async (req, res) => {
  try {
    const {
        name, description, model_path, context_window, is_active,
        n_gpu_layers, n_batch, n_ctx, enable_scala_prompt, preferred_cache_type,
        model_family, prompt_format_type, huggingface_repo, tokenizer_repo_id, is_default,
        is_embedding_model,
        config
    } = req.body;

    if (!name || !model_path) {
      return res.status(400).json({ success: false, message: 'Please provide name and model_path' });
    }
    const modelExists = await Model.findByName(name);
    if (modelExists) {
      return res.status(400).json({ success: false, message: 'Model with that name already exists' });
    }

    let modelConfig = {};
    if (config && typeof config === 'string') {
        try {
            modelConfig = JSON.parse(config);
        } catch (e) {
            console.warn(`[Add Model] Invalid existing config JSON provided for ${name}. Initializing new config. Error: ${e.message}`);
            modelConfig = {};
        }
    } else if (config && typeof config === 'object') {
        modelConfig = config;
    }
    if (n_gpu_layers !== undefined) modelConfig.n_gpu_layers = n_gpu_layers;
    if (n_batch !== undefined) modelConfig.n_batch = n_batch;

    let embeddingDimension = null;
    if (is_embedding_model && huggingface_repo) {
        console.log(`[Add Model] Attempting to fetch dimension for embedding model ${name} from ${huggingface_repo}`);
        embeddingDimension = await getEmbeddingDimensionFromHuggingFace(huggingface_repo);
        if (embeddingDimension) {
            console.log(`[Add Model] Successfully set dimension ${embeddingDimension} for ${name}`);
        } else {
            console.warn(`[Add Model] Could not automatically determine embedding dimension for ${name} (${huggingface_repo}). Please set manually if needed.`);
        }
    }

    const modelData = {
        name,
        description,
        model_path,
        context_window: context_window || 4096,
        is_active,
        enable_scala_prompt,
        preferred_cache_type,
        model_family,
        prompt_format_type,
        huggingface_repo,
        tokenizer_repo_id,
        is_default,
        is_embedding_model: !!is_embedding_model,
        embedding_dimension: embeddingDimension,
        config: JSON.stringify(modelConfig)
    };
    
    Object.keys(modelData).forEach(key => modelData[key] === undefined && delete modelData[key]);


    const modelId = await Model.create(modelData);
    const newModel = await Model.findById(modelId);

    if (newModel.is_embedding_model && newModel.is_active) {
      await handleEmbeddingModelChange();
    }

    res.status(201).json({ success: true, message: 'Model added successfully', data: newModel });
  } catch (error) {
    console.error('Add model error:', error);
    res.status(500).json({ success: false, message: 'Error adding model' });
  }
};

exports.updateModel = async (req, res) => {
    const modelIdBeingUpdated = parseInt(req.params.id, 10);

  try {
    const currentModel = await Model.findById(modelIdBeingUpdated);
    if (!currentModel) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }

    const isLocalModel = !currentModel.external_provider_id;
    const updateData = {};
    let newConfig = currentModel.config ? JSON.parse(currentModel.config) : {};
    let configChanged = false;
    let coreModelFieldsChanged = false;

    const localConfigBlobFields = ['n_batch', 'n_ctx', 'dimension', 'tensor_parallel_size', 'gpu_memory_utilization'];
    const directModelFields = [
        'description', 'enable_scala_prompt', 'preferred_cache_type', 
        'can_generate_images', 'is_embedding_model', 'huggingface_repo', 
        'model_family', 'prompt_format_type', 'tokenizer_repo_id', 'context_window', 'name', 'model_path',
        'model_type', 'model_format', 'quantization_method'
    ];

    for (const field in req.body) {
        if (Object.hasOwnProperty.call(req.body, field)) {
            let value = req.body[field];

            if (isLocalModel && localConfigBlobFields.includes(field)) {
                let processedValue;
                if (field === 'gpu_memory_utilization') {
                    if (value === 'auto' || value === '' || value === null) {
                        processedValue = 'auto';
                    } else {
                        processedValue = parseFloat(value);
                        if (isNaN(processedValue)) continue;
                    }
                } else {
                    processedValue = (value === '' || value === null) ? null : parseInt(value, 10);
                }

                if (processedValue !== newConfig[field]) {
                    newConfig[field] = processedValue;
                    configChanged = true;
                }
            } else if (directModelFields.includes(field)) {
                let currentValue = currentModel[field];
                let processedValue = value;

                if (['enable_scala_prompt', 'can_generate_images', 'is_embedding_model'].includes(field)) {
                    processedValue = (value === true || value === 'true' || value === 1 || value === '1');
                    currentValue = (currentValue === 1 || currentValue === true);
                } else if (field === 'preferred_cache_type' && value === '') {
                    processedValue = null;
                } else if (field === 'context_window' && value !== null && value !== undefined) {
                    processedValue = parseInt(value, 10);
                     if (isNaN(processedValue)) processedValue = currentModel.context_window;
                }


                if (processedValue !== currentValue) {
                    updateData[field] = processedValue;
                    coreModelFieldsChanged = true;
                }
            }
        }
    }
    
    const newIsEmbeddingModel = Object.hasOwnProperty.call(updateData, 'is_embedding_model') ? updateData.is_embedding_model : (currentModel.is_embedding_model === 1);
    const newHuggingFaceRepo = Object.hasOwnProperty.call(updateData, 'huggingface_repo') ? updateData.huggingface_repo : currentModel.huggingface_repo;

    if (newIsEmbeddingModel && newHuggingFaceRepo && 
        (updateData.is_embedding_model !== undefined || updateData.huggingface_repo !== undefined)) {
        console.log(`[Update Model] Embedding status or repo changed for ${currentModel.name}. Re-fetching dimension from ${newHuggingFaceRepo}`);
        const dimension = await getEmbeddingDimensionFromHuggingFace(newHuggingFaceRepo);
        if (dimension && currentModel.embedding_dimension !== dimension) {
            updateData.embedding_dimension = dimension;
            coreModelFieldsChanged = true;
            console.log(`[Update Model] Updated embedding_dimension to ${dimension} for ${currentModel.name}`);
        } else if (!dimension) {
            console.warn(`[Update Model] Could not automatically determine embedding dimension for ${currentModel.name} (${newHuggingFaceRepo}) on update.`);
        }
    }


    if (configChanged) {
        updateData.config = JSON.stringify(newConfig);
    }

    let needsRestart = false;
    let pythonServiceNeedsRestart = false;
    const { is_active } = req.body;

    if ( (updateData.is_embedding_model !== undefined && updateData.is_embedding_model !== (currentModel.is_embedding_model === 1)) ||
         (currentModel.is_embedding_model && updateData.huggingface_repo && updateData.huggingface_repo !== currentModel.huggingface_repo) ||
         (currentModel.is_embedding_model && updateData.is_active !== undefined && updateData.is_active !== (currentModel.is_active === 1))
       ) {
      pythonServiceNeedsRestart = true;
    }


    if (isLocalModel && vllmService.activeModelId === modelIdBeingUpdated && configChanged && 
        (newConfig.n_ctx !== (currentModel.config ? JSON.parse(currentModel.config).n_ctx : undefined) ||
         newConfig.n_gpu_layers !== (currentModel.config ? JSON.parse(currentModel.config).n_gpu_layers : undefined) ||
         newConfig.n_batch !== (currentModel.config ? JSON.parse(currentModel.config).n_batch : undefined) )) {
        needsRestart = true;
    }
    if (isLocalModel && vllmService.activeModelId === modelIdBeingUpdated && updateData.model_path && updateData.model_path !== currentModel.model_path) {
        needsRestart = true;
    }
    
    if (isLocalModel && Object.hasOwnProperty.call(req.body, 'is_active')) {
        const requestedIsActiveState = (is_active === true || is_active === 1 || is_active === '1');
        if (requestedIsActiveState !== (currentModel.is_active === 1)) {
            console.warn(`[UpdateModel] Explicit is_active change for local model ${modelIdBeingUpdated} via config update route. Prefer activate/deactivate endpoints.`);
            updateData.is_active = requestedIsActiveState; 
            needsRestart = true; 
        }
    }


    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({ success: true, message: 'No configuration changes detected.', data: currentModel });
    }

    const intendedFinalActiveState = updateData.is_active !== undefined ? (updateData.is_active === 1 || updateData.is_active === true) : (currentModel.is_active === 1);

    if (isLocalModel && needsRestart && vllmService.activeModelId === modelIdBeingUpdated && intendedFinalActiveState) {
        try {
            await vllmService.deactivateCurrentModel();
        } catch (stopError) {
            console.error(`[UpdateModel] Error deactivating current model ${modelIdBeingUpdated} for restart:`, stopError);
            return res.status(500).json({ success: false, message: `Failed to stop existing model for config update: ${stopError.message}` });
        }
    }

    const updated = await Model.update(modelIdBeingUpdated, updateData);
    if (!updated) {
      return res.status(500).json({ success: false, message: 'Model configuration not updated (database error after potential deactivation).' });
    }

    if (isLocalModel && needsRestart && intendedFinalActiveState) {
        try {
            await vllmService.activateModel(modelIdBeingUpdated);
            return res.status(200).json({
                success: true,
                message: 'Model update and activation initiated.',
                data: await Model.findById(modelIdBeingUpdated)
            });
        } catch (startError) {
            console.error(`[UpdateModel] Error activating model ${modelIdBeingUpdated} after update:`, startError);
            return res.status(500).json({
                success: false,
                message: `Model configuration saved, but failed to restart workers: ${startError.message}`,
                error_code: 'WORKER_RESTART_FAILED'
            });
        }
    }

    const finalUpdatedModel = await Model.findById(modelIdBeingUpdated);

    if (pythonServiceNeedsRestart) {
      await handleEmbeddingModelChange();
    }

    res.status(200).json({
      success: true,
      message: 'Model updated successfully',
      data: finalUpdatedModel 
    });

  } catch (error) { 
    console.error('Update model error (outer catch):', error);
    res.status(500).json({ success: false, message: `Error updating model: ${error.message || 'Unknown error'}` });
  }
}; 


exports.deleteModel = async (req, res) => {
  try {
    const modelId = parseInt(req.params.id, 10); 
    if (isNaN(modelId)) {
        return res.status(400).json({ success: false, message: 'Invalid model ID.' });
    }

    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }

    if (!model.external_provider_id && vllmService.activeModelId === modelId) {
       return res.status(400).json({ success: false, message: 'Cannot delete the currently active model. Please deactivate it first.' });
    }

    const deleted = await Model.delete(modelId);
    if (!deleted) {
      return res.status(500).json({ success: false, message: 'Model found but failed to delete from database.' });
    }

    await db.runAsync('DELETE FROM user_model_access WHERE model_id = ?', [modelId]);
    await db.runAsync('DELETE FROM group_model_access WHERE model_id = ?', [modelId]);

    const modelPath = model.model_path;
    let fileDeletedMessage = "No file path associated or model is external.";
    if (modelPath && !model.external_provider_id) {
      try {
        await fs.access(modelPath); 
        const stats = await fs.stat(modelPath);
        if (stats.isFile()) {
          await fs.unlink(modelPath);
          fileDeletedMessage = `Deleted model file: ${modelPath}`;
        } else if (stats.isDirectory()) {
          fileDeletedMessage = `Path is a directory, not automatically deleted: ${modelPath}. Use System Maintenance if needed.`;
          console.warn(`[DeleteModel] ${fileDeletedMessage}`);
        }
      } catch (fileError) {
        if (fileError.code !== 'ENOENT') {
            fileDeletedMessage = `Could not delete model file/directory (Access Denied or other error): ${modelPath}`;
            console.warn(`[DeleteModel] ${fileDeletedMessage}`, fileError.message);
        } else {
            fileDeletedMessage = `Model file/directory not found at path: ${modelPath}`;
        }
      }
    }

    res.status(200).json({ success: true, message: `Model deleted successfully. ${fileDeletedMessage}` });
  } catch (error) {
    console.error('Delete model error:', error);
    res.status(500).json({ success: false, message: `Error deleting model: ${error.message || 'Unknown error'}` });
  }
};

/**
 * Update only the active status of a model (admin only)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
exports.updateModelStatus = async (req, res) => {
  const modelId = parseInt(req.params.id, 10);
  const { isActive } = req.body; 

  if (isNaN(modelId)) {
    return res.status(400).json({ success: false, message: 'Invalid Model ID provided.' });
  }
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid request: isActive must be a boolean value.' });
  }

  try {
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, message: 'Model not found.' });
    }

    if (!model.external_provider_id) {
       return res.status(400).json({ 
         success: false, 
         message: 'This endpoint is only for toggling external provider status. Use activate/deactivate for local models.' 
       });
    }

    const updateData = { is_active: isActive ? 1 : 0 };
    const updated = await Model.update(modelId, updateData);

    if (!updated) {
      const currentModel = await Model.findById(modelId);
      if (currentModel && currentModel.is_active === updateData.is_active) {
         return res.status(200).json({ success: true, message: 'Model status already set.', data: currentModel });
      } else {
         return res.status(500).json({ success: false, message: 'Failed to update model status in database.' });
      }
    }

    const finalUpdatedModel = await Model.findById(modelId);
    res.status(200).json({
      success: true,
      message: `Model status updated successfully to ${isActive ? 'active' : 'inactive'}.`,
      data: finalUpdatedModel
    });

  } catch (error) {
    console.error(`Error updating model status for ID ${modelId}:`, error);
    res.status(500).json({ success: false, message: `Error updating model status: ${error.message || 'Unknown error'}` });
  }
};


exports.getModelsByProvider = async (req, res) => {
  try {
    const { provider_id } = req.query;
    if (!provider_id) {
      return res.status(400).json({ success: false, message: 'Provider ID is required' });
    }
    const models = await db.allAsync('SELECT id, name, description, context_window FROM models WHERE external_provider_id = ? AND is_active = 1', [provider_id]);
    res.status(200).json({ success: true, count: models.length, data: models });
  } catch (error) {
    console.error('Get models by provider error:', error);
    res.status(500).json({ success: false, message: 'Error fetching models by provider' });
  }
};

exports.getModelContexts = async (req, res) => {
  try {
    const modelId = parseInt(req.params.id, 10);
     if (isNaN(modelId)) {
        return res.status(400).json({ success: false, message: 'Invalid model ID.' });
    }
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }
    const contexts = await db.allAsync('SELECT * FROM model_contexts WHERE model_id = ?', [modelId]);
    res.status(200).json({ success: true, count: contexts.length, data: contexts });
  } catch (error) {
    console.error('Get model contexts error:', error);
    res.status(500).json({ success: false, message: 'Error fetching model contexts' });
  }
};

exports.addModelContext = async (req, res) => {
  try {
    const { name, content, is_default } = req.body;
    const modelId = parseInt(req.params.id, 10);
     if (isNaN(modelId)) {
        return res.status(400).json({ success: false, message: 'Invalid model ID.' });
    }
    if (!name || !content) {
      return res.status(400).json({ success: false, message: 'Please provide name and content' });
    }
    const model = await Model.findById(modelId);
    if (!model) {
      return res.status(404).json({ success: false, message: 'Model not found' });
    }
    if (is_default) {
      await db.runAsync('UPDATE model_contexts SET is_default = 0 WHERE model_id = ?', [modelId]);
    }
    const result = await db.runAsync('INSERT INTO model_contexts (model_id, name, content, is_default) VALUES (?, ?, ?, ?)', [modelId, name, content, is_default ? 1 : 0]);
    const newContext = await db.getAsync('SELECT * FROM model_contexts WHERE id = ?', [result.lastID]);
    res.status(201).json({ success: true, message: 'Model context added successfully', data: newContext });
  } catch (error) {
    console.error('Add model context error:', error);
    res.status(500).json({ success: false, message: 'Error adding model context' });
  }
};
