// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const EventSource = require('eventsource');
const { pythonResearchService } = require('../services/pythonResearchService');
const { APIError } = require('../utils/errorUtils');
const { isCancellationRequested, clearCancellationRequest, registerCancellationOnDisconnect } = require('../utils/cancellationManager');
const UsageStatsService = require('../services/usageStatsService');
const Model = require('../models/Model'); 
const User = require('../models/User'); 
const { getSystemSetting } = require('../config/systemConfig'); 
const apiKeyService = require('../services/apiKeyService'); 
const { db } = require('../models/db'); 
const vllmService = require('../services/vllmService');
const reasoningLoggerService = require('../services/reasoningLoggerService');

const initiateDeepSearchStream = async (req, res, next) => {
  const { 
    query: originalUserQuery,
    reasoningModelName, 
    synthesisModelName, 
    search_providers,
    max_distinct_search_queries,
    max_results_per_provider_query,
    max_url_exploration_depth,
    max_hops,
    chunk_size_words,
    chunk_overlap_words,
    top_k_retrieval_per_hop,
  } = req.body;

  const userId = req.user.id; 
  const apiTaskId = `api_ds_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  let pythonTaskCompletedSuccessfully = false; 
  let anErrorWasAlreadySentToClient = false; 

  try {
    if (!reasoningModelName) {
      return next(new APIError("Missing required parameter: 'reasoningModelName'.", 400));
    }
    if (!synthesisModelName) {
      return next(new APIError("Missing required parameter: 'synthesisModelName'.", 400));
    }

    // --- Reasoning Model Handling with Fallback ---
    let originalReasoningModelName = reasoningModelName;
    let reasoningModelInfoFull = await Model.findById(originalReasoningModelName) || await Model.findByName(originalReasoningModelName) || await Model.findByExternalModelId(originalReasoningModelName);
    
    const accessibleModels = await Model.getActiveForUser(userId);
    const currentUser = await User.findById(userId);
    let performReasoningFallback = false;

    if (reasoningModelInfoFull) {
        const isRequestedModelAccessible = accessibleModels.some(m => m.id === reasoningModelInfoFull.id) || (currentUser && currentUser.is_admin);
        if (!isRequestedModelAccessible) {
            console.warn(`[DeepSearchAPI:${apiTaskId}] Requested reasoning model '${originalReasoningModelName}' (ID: ${reasoningModelInfoFull.id}) found but is not accessible to user ${userId}. Attempting fallback to local model.`);
            performReasoningFallback = true;
        }
    } else {
        if (originalReasoningModelName && originalReasoningModelName.toLowerCase() !== 'local') {
            console.warn(`[DeepSearchAPI:${apiTaskId}] Requested reasoning model '${originalReasoningModelName}' not found. Attempting fallback to local model.`);
            performReasoningFallback = true;
        } else if (!originalReasoningModelName) {
            console.log(`[DeepSearchAPI:${apiTaskId}] No reasoningModelName provided. Defaulting to local model for reasoning.`);
            performReasoningFallback = true;
        }
    }

    if (performReasoningFallback) {
        reasoningModelName = "local"; 
        reasoningModelInfoFull = null;  
    } else if (reasoningModelInfoFull && reasoningModelInfoFull.external_provider_id && !reasoningModelInfoFull.provider_name) {
       
        const provider = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [reasoningModelInfoFull.external_provider_id]);
        if (provider) reasoningModelInfoFull.provider_name = provider.name;
        else console.error(`[DeepSearchAPI:${apiTaskId}] Provider not found for reasoning model ${reasoningModelInfoFull.name}`);
    }

    // --- Synthesis Model Handling with Fallback ---
    let originalSynthesisModelName = synthesisModelName;
    let synthesisModelInfoFull = await Model.findById(originalSynthesisModelName) || await Model.findByName(originalSynthesisModelName) || await Model.findByExternalModelId(originalSynthesisModelName);
    let performSynthesisFallback = false;

    if (synthesisModelInfoFull) {
        const isRequestedModelAccessible = accessibleModels.some(m => m.id === synthesisModelInfoFull.id) || (currentUser && currentUser.is_admin);
        if (!isRequestedModelAccessible) {
            console.warn(`[DeepSearchAPI:${apiTaskId}] Requested synthesis model '${originalSynthesisModelName}' (ID: ${synthesisModelInfoFull.id}) found but is not accessible to user ${userId}. Attempting fallback to local model.`);
            performSynthesisFallback = true;
        }
    } else {
        if (originalSynthesisModelName && originalSynthesisModelName.toLowerCase() !== 'local') {
            console.warn(`[DeepSearchAPI:${apiTaskId}] Requested synthesis model '${originalSynthesisModelName}' not found. Attempting fallback to local model.`);
            performSynthesisFallback = true;
        } else if (!originalSynthesisModelName) {
            console.log(`[DeepSearchAPI:${apiTaskId}] No synthesisModelName provided. Defaulting to local model for synthesis.`);
            performSynthesisFallback = true;
        }
    }

    if (performSynthesisFallback) {
        synthesisModelName = "local"; 
        synthesisModelInfoFull = null;  
    } else if (synthesisModelInfoFull && synthesisModelInfoFull.external_provider_id && !synthesisModelInfoFull.provider_name) {
        
        const provider = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [synthesisModelInfoFull.external_provider_id]);
        if (provider) synthesisModelInfoFull.provider_name = provider.name;
        else console.error(`[DeepSearchAPI:${apiTaskId}] Provider not found for synthesis model ${synthesisModelInfoFull.name}`);
    }

    async function prepareModelInfoForPython(inputModelNameFromRequest, resolvedModelFullFromDBLookup, isForReasoning) {
        const modelTypeForErrorMsg = isForReasoning ? "Reasoning" : "Synthesis";
        const modelPoolManager = require('../services/modelPoolManager');
        const poolState = modelPoolManager.getPoolState();

        const findReadyModelProcess = (modelId = null) => {
            return Object.values(poolState).find(p => 
                p.status === 'ready' &&
                !p.model.is_embedding_model &&
                (modelId ? p.modelId === modelId : true)
            );
        };

        let modelToUse = null;
        let isLocal = false;

        // Scenario 1: User explicitly requests "local"
        if (inputModelNameFromRequest && inputModelNameFromRequest.toLowerCase() === 'local') {
            const readyProcess = findReadyModelProcess(); 
            if (!readyProcess) {
                throw new APIError(`${modelTypeForErrorMsg} model specified as "local", but no suitable local model is active or found.`, 400);
            }
            modelToUse = readyProcess.model;
            isLocal = true;
        } 
        // Scenario 2: User specifies a model by name/ID
        else if (resolvedModelFullFromDBLookup) {
            if (!resolvedModelFullFromDBLookup.external_provider_id) {
                if (resolvedModelFullFromDBLookup.is_embedding_model) {
                    throw new APIError(`The requested local model ('${resolvedModelFullFromDBLookup.name}') is an embedding model and cannot be used for ${modelTypeForErrorMsg.toLowerCase()}.`, 400);
                }
                const readyProcess = findReadyModelProcess(resolvedModelFullFromDBLookup.id);
                if (!readyProcess) {
                    throw new APIError(`The requested local model ('${resolvedModelFullFromDBLookup.name}') is not active or not ready in the vLLM pool.`, 400);
                }
                modelToUse = resolvedModelFullFromDBLookup;
                isLocal = true;
            } else {
                modelToUse = resolvedModelFullFromDBLookup;
                isLocal = false;
            }
        }
        // Scenario 3: No model found
        else {
            throw new APIError(`${modelTypeForErrorMsg} model name '${inputModelNameFromRequest}' could not be resolved.`, 400);
        }

        if (isLocal) {
            const vllmApiUrl = vllmService.getVllmApiUrl(modelToUse.id);
            if (!vllmApiUrl) {
                 throw new APIError(`Could not determine vLLM API URL for local model '${modelToUse.name}'. Is it running correctly?`, 500);
            }
            const apiConfigAdditions = { llm_local_apiBaseUrl: vllmApiUrl };

            return {
                modelInfo: {
                    name: modelToUse.name, 
                    provider_name: 'local', 
                    id: String(modelToUse.id),
                    served_model_name: modelToUse.name,
                    temperature: modelToUse.temperature,
                    max_tokens: modelToUse.max_tokens,
                    model_family: modelToUse.model_family,
                    prompt_format_type: modelToUse.prompt_format_type,
                    external_model_id: null, 
                    context_window: modelToUse.context_window,
                    tokenizer_repo_id: modelToUse.tokenizer_repo_id
                },
                apiConfigAdditions: apiConfigAdditions
            };
        } 
        else {
            if (modelToUse.is_embedding_model) { 
                throw new APIError(`${modelTypeForErrorMsg} model '${modelToUse.name}' is an embedding model and cannot be used for this task.`, 400);
            }
            const providerData = await db.getAsync('SELECT name FROM api_providers WHERE id = ?', [modelToUse.external_provider_id]);
            if (!providerData || !providerData.name) {
                throw new APIError(`Provider details not found for ${modelTypeForErrorMsg} model '${modelToUse.name}' (external_provider_id: ${modelToUse.external_provider_id}).`, 500);
            }
            return {
                modelInfo: {
                    name: modelToUse.name, 
                    provider_name: providerData.name, // Use actual provider name
                    id: String(modelToUse.id),
                    served_model_name: modelToUse.name,
                    temperature: modelToUse.temperature,
                    max_tokens: modelToUse.max_tokens,
                    model_family: modelToUse.model_family,
                    prompt_format_type: modelToUse.prompt_format_type,
                    external_model_id: modelToUse.external_model_id,
                    context_window: modelToUse.context_window,
                    tokenizer_repo_id: modelToUse.tokenizer_repo_id
                },
                apiConfigAdditions: {}
            };
        }
    }

    const { modelInfo: finalReasoningModelInfo, apiConfigAdditions: reasoningApiConfig } = await prepareModelInfoForPython(reasoningModelName, reasoningModelInfoFull, true); 
    const { modelInfo: finalSynthesisModelInfo, apiConfigAdditions: synthesisApiConfig } = await prepareModelInfoForPython(synthesisModelName, synthesisModelInfoFull, false); 
    
    // Post-preparation accessibility check
    if (finalReasoningModelInfo && finalReasoningModelInfo.id) {
        let isModelConsideredAccessible = false;
        if (performReasoningFallback) { 
            isModelConsideredAccessible = true; 
            console.log(`[DeepSearchAPI:${apiTaskId}] Fallback to local model '${finalReasoningModelInfo.name}' for reasoning was used. Bypassing standard accessibility check for this fallback model.`);
        } else {
            isModelConsideredAccessible = accessibleModels.some(m => m.id === finalReasoningModelInfo.id) || (currentUser && currentUser.is_admin);
        }

        if (!isModelConsideredAccessible) {
            return next(new APIError(`Resolved reasoning model '${finalReasoningModelInfo.name}' (ID: ${finalReasoningModelInfo.id}) is not accessible. Original request: '${originalReasoningModelName}'. Fallback performed: ${performReasoningFallback}.`, 403));
        }
    } else { 
        return next(new APIError(`Could not resolve a valid reasoning model. Original request: '${originalReasoningModelName}'. Fallback performed: ${performReasoningFallback}.`, 400));
    }

    if (finalSynthesisModelInfo && finalSynthesisModelInfo.id) {
        let isModelConsideredAccessible = false;
        if (performSynthesisFallback) { 
            isModelConsideredAccessible = true;
            console.log(`[DeepSearchAPI:${apiTaskId}] Fallback to local model '${finalSynthesisModelInfo.name}' for synthesis was used. Bypassing standard accessibility check.`);
        } else {
            isModelConsideredAccessible = accessibleModels.some(m => m.id === finalSynthesisModelInfo.id) || (currentUser && currentUser.is_admin);
        }

        if (!isModelConsideredAccessible) {
            return next(new APIError(`Resolved synthesis model '${finalSynthesisModelInfo.name}' (ID: ${finalSynthesisModelInfo.id}) is not accessible. Original request: '${originalSynthesisModelName}'. Fallback performed: ${performSynthesisFallback}.`, 403));
        }
    } else {
        return next(new APIError(`Could not resolve a valid synthesis model. Original request: '${originalSynthesisModelName}'. Fallback performed: ${performSynthesisFallback}.`, 400));
    }
    
    const api_config = { ...(reasoningApiConfig || {}), ...(synthesisApiConfig || {}) };
    const searchProvidersToFetchKeysFor = [
        { keyInApiConfig: 'BRAVE_SEARCH_API_KEY', serviceName: 'Brave Search' },
        { keyInApiConfig: 'GOOGLE_API_KEY', serviceName: 'Google Search' },
        { keyInApiConfig: 'BING_API_KEY', serviceName: 'Bing Search' },
        { keyInApiConfig: 'COURTLISTENER_API_KEY', serviceName: 'CourtListener' } 
    ];
    for (const provider of searchProvidersToFetchKeysFor) {
        try {
            const apiKeyData = await apiKeyService.getBestApiKey(userId, provider.serviceName);
            if (apiKeyData?.key) {
                api_config[provider.keyInApiConfig] = apiKeyData.key;
                if (provider.serviceName === 'Google Search' && apiKeyData.extra_config) {
                    try {
                        const extra = JSON.parse(apiKeyData.extra_config);
                        if (extra.cx) api_config.GOOGLE_CX = extra.cx;
                    } catch (e) { }
                }
            } else {
                console.warn(`[DeepSearchAPI:${apiTaskId}] API key NOT found for search provider: ${provider.serviceName} for user ${userId}`);
            }
        } catch (err) { }
    }

    const capitalizeFirstLetter = (string) => {
      if (!string) return '';
      return string.charAt(0).toUpperCase() + string.slice(1);
    };

    if (finalReasoningModelInfo.external_model_id && finalReasoningModelInfo.provider_name && finalReasoningModelInfo.provider_name !== 'local') {
      let providerNameForApiKeyService, configKeyName;
      
      if (finalReasoningModelInfo.provider_name.toLowerCase() === 'xai') {
        providerNameForApiKeyService = 'xAI'; 
        configKeyName = 'llm_xAI_apiKey';
      } else {
        providerNameForApiKeyService = capitalizeFirstLetter(finalReasoningModelInfo.provider_name);
        configKeyName = `llm_${providerNameForApiKeyService}_apiKey`;
      }
      
      let reasoningApiKeyObj = await apiKeyService.getBestApiKey(userId, providerNameForApiKeyService);
      
      // For xAI, try alternative service names if first attempt fails
      if (!reasoningApiKeyObj?.key && finalReasoningModelInfo.provider_name.toLowerCase() === 'xai') {
        const alternativeNames = ['Xai', 'xai', 'XAI', 'x.ai']; 
        for (const altName of alternativeNames) {
          if (altName === providerNameForApiKeyService) continue; 
          reasoningApiKeyObj = await apiKeyService.getBestApiKey(userId, altName);
          if (reasoningApiKeyObj?.key) {
            providerNameForApiKeyService = altName; 
            break;
          }
        }
      }

      if (reasoningApiKeyObj?.key && reasoningApiKeyObj.key.trim()) {
        api_config[configKeyName] = reasoningApiKeyObj.key.trim();
      } else {
        console.warn(`[DeepSearchAPI:${apiTaskId}] API key not found or empty for reasoning model provider: ${finalReasoningModelInfo.provider_name} (tried service name: ${providerNameForApiKeyService})`);
      }
    }
    let shouldFetchSynthesisKey = false;
    if (finalSynthesisModelInfo.external_model_id && finalSynthesisModelInfo.provider_name && finalSynthesisModelInfo.provider_name !== 'local') {
        const capitalizedSynthesisProviderForConfigKey = capitalizeFirstLetter(finalSynthesisModelInfo.provider_name);
        if (finalSynthesisModelInfo.provider_name !== finalReasoningModelInfo.provider_name || !api_config[`llm_${capitalizedSynthesisProviderForConfigKey}_apiKey`]) {
            shouldFetchSynthesisKey = true;
        }
    }

    if (shouldFetchSynthesisKey) {
      let providerNameForApiKeyServiceSynthesis, configKeyNameSynthesis;

      if (finalSynthesisModelInfo.provider_name.toLowerCase() === 'xai') {
        providerNameForApiKeyServiceSynthesis = 'xAI'; 
        configKeyNameSynthesis = 'llm_xAI_apiKey';
      } else {
        providerNameForApiKeyServiceSynthesis = capitalizeFirstLetter(finalSynthesisModelInfo.provider_name);
        configKeyNameSynthesis = `llm_${providerNameForApiKeyServiceSynthesis}_apiKey`;
      }

      let synthesisApiKeyObj = await apiKeyService.getBestApiKey(userId, providerNameForApiKeyServiceSynthesis);

      // For xAI, try alternative service names if first attempt fails
      if (!synthesisApiKeyObj?.key && finalSynthesisModelInfo.provider_name.toLowerCase() === 'xai') {
        const alternativeNames = ['Xai', 'xai', 'XAI', 'x.ai'];
        for (const altName of alternativeNames) {
          if (altName === providerNameForApiKeyServiceSynthesis) continue;
          synthesisApiKeyObj = await apiKeyService.getBestApiKey(userId, altName);
          if (synthesisApiKeyObj?.key) {
            providerNameForApiKeyServiceSynthesis = altName; 
            break;
          }
        }
      }

      if (synthesisApiKeyObj?.key && synthesisApiKeyObj.key.trim() && !api_config[configKeyNameSynthesis]) {
        api_config[configKeyNameSynthesis] = synthesisApiKeyObj.key.trim();
      } else if (synthesisApiKeyObj?.key && synthesisApiKeyObj.key.trim() && api_config[configKeyNameSynthesis]) {
      }
      else {
        console.warn(`[DeepSearchAPI:${apiTaskId}] API key not found or empty for synthesis model provider: ${finalSynthesisModelInfo.provider_name} (tried service name: ${providerNameForApiKeyServiceSynthesis})`);
      }
    }

    if (finalReasoningModelInfo.provider_name?.toLowerCase() === 'xai' || 
        finalSynthesisModelInfo.provider_name?.toLowerCase() === 'xai') {
      api_config.llm_xAI_apiBase = 'https://api.x.ai/v1';  
    }

    const requiredApiKeys = [];

    if (finalReasoningModelInfo.provider_name?.toLowerCase() === 'google' || finalSynthesisModelInfo.provider_name?.toLowerCase() === 'google') {
      requiredApiKeys.push('llm_Google_apiKey');
    }
    if (finalReasoningModelInfo.provider_name?.toLowerCase() === 'xai' || finalSynthesisModelInfo.provider_name?.toLowerCase() === 'xai') {
      requiredApiKeys.push('llm_xAI_apiKey');
    }
    
    const missingKeys = requiredApiKeys.filter(key => {
      const value = api_config[key];
      return !value || value === 'undefined' || value === 'null' || String(value).trim() === '';
    });

    if (missingKeys.length > 0) {
      console.error(`[DeepSearchAPI:${apiTaskId}] Required API keys are missing or invalid.`);
      return next(new APIError(`Missing or invalid API keys: ${missingKeys.join(', ')}. Please ensure these are configured in your account or system.`, 400));
    }


    // --- Construct the payload for Python service ---
    const requestParamsPayload = {
      initial_query: originalUserQuery,
      reasoning_model_info: finalReasoningModelInfo,
      synthesis_model_info: finalSynthesisModelInfo
    };

    if (search_providers !== undefined) requestParamsPayload.search_providers = search_providers;
    if (max_distinct_search_queries !== undefined) requestParamsPayload.max_distinct_search_queries = max_distinct_search_queries;
    if (max_results_per_provider_query !== undefined) requestParamsPayload.max_results_per_provider_query = max_results_per_provider_query;
    if (max_url_exploration_depth !== undefined) requestParamsPayload.max_url_exploration_depth = max_url_exploration_depth;
    if (max_hops !== undefined) requestParamsPayload.max_hops = max_hops;
    if (chunk_size_words !== undefined) requestParamsPayload.chunk_size_words = chunk_size_words;
    if (chunk_overlap_words !== undefined) requestParamsPayload.chunk_overlap_words = chunk_overlap_words;
    if (top_k_retrieval_per_hop !== undefined) requestParamsPayload.top_k_retrieval_per_hop = top_k_retrieval_per_hop;

    Object.keys(requestParamsPayload).forEach(key => {
        if (requestParamsPayload[key] === undefined) {
            delete requestParamsPayload[key];
        }
    });
    
    const finalPayloadForPython = {
      user_id: String(userId),
      request_params: requestParamsPayload,
      api_config: api_config 
    };
    
    // Handle embedding_model_id_or_path separately, add to api_config if present
    let embeddingModelPathForPython = null;
    const embeddingModelDbId = getSystemSetting('preferred_local_embedding_model_id');
    if (embeddingModelDbId) {
        try {
            const embeddingModelData = await Model.findById(parseInt(embeddingModelDbId, 10));
            if (embeddingModelData && (embeddingModelData.huggingface_repo || embeddingModelData.model_path)) {
                embeddingModelPathForPython = embeddingModelData.huggingface_repo || embeddingModelData.model_path;
            }
        } catch(e){ console.warn(`[DeepSearchAPI:${apiTaskId}] Could not load preferred embedding model details: ${e.message}`); }
    }
    if (embeddingModelPathForPython) {
        if (!finalPayloadForPython.api_config) finalPayloadForPython.api_config = {};
        finalPayloadForPython.api_config.embedding_model_id_or_path = embeddingModelPathForPython;
    }

    const { task_id: pythonTaskId, stream_url } = await pythonResearchService.initiateResearch(finalPayloadForPython);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    const pythonSseClient = new EventSource(stream_url);
    let clientDisconnected = false;


    const onClientDisconnect = () => {
      if (!clientDisconnected) {
        clientDisconnected = true;
        pythonSseClient.close();
        clearCancellationRequest(apiTaskId); 
      }
    };
    req.on('close', onClientDisconnect);

    const eventTypesToRelay = ['progress', 'markdown_chunk', 'complete', 'error', 'cancelled', 'heartbeat'];

    eventTypesToRelay.forEach(eventTypeToListen => {
      pythonSseClient.addEventListener(eventTypeToListen, async (event) => {
        if (clientDisconnected) return;
        
        const eventDataString = event.data;
        const eventId = event.id || event.lastEventId || new Date().getTime(); 

        if (eventTypeToListen === 'progress') {
        } else if (eventTypeToListen !== 'heartbeat') { 
        }

        if (eventTypeToListen === 'heartbeat') {
          if (!res.writableEnded) {
          }
          return; 
        }

        if (eventTypeToListen === 'complete') {
          pythonTaskCompletedSuccessfully = true;
          if (eventDataString) {
            try {
              const payload = JSON.parse(eventDataString);
            if (payload && Array.isArray(payload.detailed_token_usage)) {
              for (const usage of payload.detailed_token_usage) {
                try {
                  await UsageStatsService.recordTokens({ 
                    userId, 
                    chatId: null, 
                    modelId: usage.model_id, 
                    promptTokens: usage.prompt_tokens, 
                    completionTokens: usage.completion_tokens, 
                    totalTokens: usage.total_tokens, 
                    source: 'deep_search_api' 
                  });
                } catch (tokenLogError) { console.error(`[DeepSearchAPI:${apiTaskId}] Failed to log token usage for model ${usage.model_id}:`, tokenLogError); }
              }
            }
            } catch (parseError) { console.error(`[DeepSearchAPI:${apiTaskId}] Error parsing 'complete' event data for token logging:`, parseError); }
          }
        } else if (eventTypeToListen === 'error') {
          pythonTaskCompletedSuccessfully = false;
          anErrorWasAlreadySentToClient = true;
          console.error(`[DeepSearchAPI:${apiTaskId}] Processing 'error' event. Data: ${eventDataString}`);
          if (!res.writableEnded) {
            res.write(`id: ${eventId}\n`);
            res.write(`event: error\ndata: ${eventDataString}\n\n`);
            res.end();
          }
          if (!clientDisconnected) { 
            pythonSseClient.close();
            clientDisconnected = true; 
          }
          return; 
        }

        if (!res.writableEnded) {
          res.write(`id: ${eventId}\n`);
          res.write(`event: ${eventTypeToListen}\n`);
          res.write(`data: ${eventDataString}\n\n`);
        }

        if (eventTypeToListen === 'complete' || eventTypeToListen === 'cancelled') {
          if (!clientDisconnected) { 
             pythonSseClient.close();
          }
        }
      });
    });

    pythonSseClient.onerror = (error) => {
      if (clientDisconnected) return; 

      const errorStatus = error.status; 
      const errorType = error.type; 
      const errorMessageDetail = error.message || (errorType ? `EventSource error type: ${errorType}` : 'Unknown stream error');
      
      if (pythonTaskCompletedSuccessfully) {
        console.info(`[DeepSearchAPI:${apiTaskId}] onerror: EventSource error for task ${pythonTaskId} (Type: ${errorType}, Msg: ${errorMessageDetail}). Task had already reported 'complete'. This is likely a normal stream closure event from the client's perspective.`);
      } else if (anErrorWasAlreadySentToClient) {
        console.info(`[DeepSearchAPI:${apiTaskId}] onerror: EventSource error for task ${pythonTaskId} (Type: ${errorType}, Msg: ${errorMessageDetail}). A Python-originated error was already processed and sent to the client.`);
      } else {
        console.error(`[DeepSearchAPI:${apiTaskId}] onerror: Unexpected EventSource error for task ${pythonTaskId}. Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        console.error(`[DeepSearchAPI:${apiTaskId}] onerror: Parsed details - Status: ${errorStatus}, Type: ${errorType}, Message: ${errorMessageDetail}`);
        
        if (!res.writableEnded) {
            let clientErrorPayload = {
                message: 'A problem occurred with the backend data stream.',
                details: errorMessageDetail,
                status: errorStatus || 'Stream Error' 
            };
            console.error(`[DeepSearchAPI:${apiTaskId}] onerror: Relaying new stream error to client.`);
            res.write(`event: error\ndata: ${JSON.stringify(clientErrorPayload)}\n\n`);
            anErrorWasAlreadySentToClient = true; 
        }
      }
      
      if (!clientDisconnected) {
          pythonSseClient.close();
      }
    };
    
    pythonSseClient.addEventListener('close', () => {
        if (clientDisconnected && !res.writableEnded && anErrorWasAlreadySentToClient) {
            res.end();
            clearCancellationRequest(apiTaskId);
            return;
        }
        if (!clientDisconnected) { 
            clientDisconnected = true; 
            if (pythonTaskCompletedSuccessfully) {
            } else if (!anErrorWasAlreadySentToClient) {
                console.warn(`[DeepSearchAPI:${apiTaskId}] onclose: Python SSE stream closed BEFORE 'complete' event was received and no prior error sent. Sending 'stream ended prematurely' error to client.`);
                if (!res.writableEnded) {
                    res.write(`event: error\ndata: ${JSON.stringify({ message: 'Backend stream ended prematurely.', details: 'The deep search task did not signal completion before the stream closed, and no specific Python error was received.', status: 'N/A' })}\n\n`);
                }
            }
            if (!res.writableEnded) {
                res.end();
            }
            clearCancellationRequest(apiTaskId);
        } else {
            if (!res.writableEnded) {
                res.end();
            }
        }
    });

  } catch (error) {
    console.error(`[DeepSearchAPI:${apiTaskId}] Failed to initiate deep search or stream:`, error);
    if (!res.headersSent) {
      return next(new APIError(error.message || 'Failed to start deep search task.', error.statusCode || 500));
    } else if (!res.writableEnded && !anErrorWasAlreadySentToClient) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Failed to process deep search task.', details: error.message })}\n\n`);
      res.end();
    } else if (!res.writableEnded) {
      res.end(); 
    }
  }
};

module.exports = {
  initiateDeepSearchStream,
};
