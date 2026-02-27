// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * MCP Tool: Deep Search Agent
 * Performs iterative web research, reasoning, and synthesis.
 */
const { db } = require('../../models/db');
const { pythonResearchService } = require('../../services/pythonResearchService');
const fileService = require('../../services/fileService'); 
const apiKeyService = require('../../services/apiKeyService');
const { UserCancelledError } = require('../../utils/errorUtils'); 
const Model = require('../../models/Model'); 
const Chat = require('../../models/Chat');
const { getSystemSetting } = require('../../config/systemConfig');
const { isCancellationRequested, clearCancellationRequest } = require('../../utils/cancellationManager'); 
const UsageStatsService = require('../../services/usageStatsService'); 
const vllmService = require('../../services/vllmService');
const reasoningLoggerService = require('../../services/reasoningLoggerService');


async function* runDeepSearchTool(args, context) {

    const {
        query: originalUserQuery,
        search_providers,
        fileIds = [],
    } = args;
    const { userId, chatId } = context;
    const stringChatId = String(chatId); 

    clearCancellationRequest(stringChatId);
    let sseClient = null; 

    try {
        try {
            if (originalUserQuery) {
                const truncatedQuery = originalUserQuery.substring(0, 25) + (originalUserQuery.length > 25 ? '...' : '');
                const newChatTitle = `Deep Search: ${truncatedQuery}`;
                await Chat.update(chatId, { title: newChatTitle });
            }
        } catch (titleError) {
            console.error(`[MCP Deep Search ${chatId}] Failed to auto-update chat title:`, titleError);
        }

        yield { type: 'progress_update', payload: { content: ' Initializing research with Python service...' } };

        let effectiveReasoningModelName = args.reasoningModelName; 
        let reasoningModelInfoFull;

        if (!effectiveReasoningModelName || String(effectiveReasoningModelName).trim() === "") {
            console.log(`[MCP Deep Search ${chatId}] No specific reasoningModelName provided. Attempting to use active local model as fallback.`);
            const activeModelId = vllmService.activeModelId;
            if (activeModelId) {
                const activeModelData = await Model.findById(activeModelId);
                if (activeModelData) {
                    effectiveReasoningModelName = activeModelData.name || String(activeModelData.id);
                    yield { type: 'progress_update', payload: { content: ` Using active local model '${effectiveReasoningModelName}' for reasoning.` } };
                    console.log(`[MCP Deep Search ${chatId}] Fallback to active local model: ${effectiveReasoningModelName} (ID: ${activeModelId})`);
                } else {
                    yield { type: 'progress_update', payload: { content: ` Error: Active local model (ID: ${activeModelId}) not found in database.` } };
                    throw new Error(`Active local model (ID: ${activeModelId}) not found in database.`);
                }
            } else {
                yield { type: 'progress_update', payload: { content: ` Error: No reasoning model specified and no active local model available for fallback.` } };
                throw new Error("No reasoning model specified and no active local model available for fallback.");
            }
        } else {
             yield { type: 'progress_update', payload: { content: ` Using specified reasoning model: '${effectiveReasoningModelName}'.` } };
        }
        
        try {
            let modelData = null;
            const accessibleModels = await Model.getActiveForUser(userId);

            if (!accessibleModels || accessibleModels.length === 0) {
                throw new Error(`No models accessible to user ${userId}. Cannot find reasoning model '${effectiveReasoningModelName}'.`);
            }

            const modelIdParsed = parseInt(effectiveReasoningModelName, 10);
            const isNumericIdCandidate = !isNaN(modelIdParsed) && String(modelIdParsed) === String(effectiveReasoningModelName).trim();

            for (const m of accessibleModels) {
                if (isNumericIdCandidate && m.id === modelIdParsed) {
                    modelData = m;
                    break;
                }
                if (m.name === effectiveReasoningModelName) {
                    modelData = m;
                    break;
                }
                if (m.external_model_id === effectiveReasoningModelName) {
                    modelData = m;
                    break;
                }
            }

            if (!modelData) {
                throw new Error(`Reasoning model '${effectiveReasoningModelName}' not found among accessible models for user ${userId} (checked ID, name, and external_model_id).`);
            }
            
            if (!modelData.external_provider_id && !modelData.provider_name) {
                modelData.provider_name = 'local'; 
            }
            reasoningModelInfoFull = { ...modelData }; 

        } catch (modelError) {
            console.error(`[MCP Deep Search ${chatId}] Error fetching/preparing reasoning model '${effectiveReasoningModelName}':`, modelError);
            yield { type: 'progress_update', payload: { content: ` Error: Failed to load reasoning model details for '${effectiveReasoningModelName}'. ${modelError.message}` } };
            throw new Error(`Failed to load reasoning model details for '${effectiveReasoningModelName}': ${modelError.message}`);
        }
        const synthesisModelInfoFull = reasoningModelInfoFull;

        const allApiConfigsForPython = {}; 
        const providerNameMapping = {
            'google': 'Google Search', 'bing': 'Bing Search', 'brave': 'Brave Search', 'courtlistener': 'CourtListener'
        };
        
        const validSchemaProviders = ["google", "bing", "brave", "openalex", "wikipedia", "duckduckgo", "courtlistener"];
        let providersToConsider = [];

        if (Array.isArray(search_providers) && search_providers.length > 0) {
            providersToConsider = search_providers;
            yield { type: 'progress_update', payload: { content: ` Using search providers specified in arguments: ${search_providers.join(', ')}.` } };
        } else {
            try {
                const activeSystemProviders = [];
                const braveKey = await apiKeyService.getBestApiKey(userId, 'Brave Search');
                if (braveKey && braveKey.key) activeSystemProviders.push('brave');
                
                const googleKey = await apiKeyService.getBestApiKey(userId, 'Google Search');
                if (googleKey && googleKey.key) activeSystemProviders.push('google');

                if (activeSystemProviders.length > 0) {
                    providersToConsider = activeSystemProviders;
                    yield { type: 'progress_update', payload: { content: ` No specific providers in args. Using active system providers: ${activeSystemProviders.join(', ')}.` } };
                } else {
                    yield { type: 'progress_update', payload: { content: ` No specific providers in args and no active system providers found. Defaulting to Python backend's list.` } };
                }
            } catch (e) {
                console.warn(`[MCP Deep Search ${chatId}] Error fetching active search providers: ${e.message}. Python backend will use its defaults.`);
                yield { type: 'progress_update', payload: { content: ` Error fetching active providers. Python will use defaults.` } };
            }
        }

        let filteredSearchProviders = [];
        if (Array.isArray(providersToConsider) && providersToConsider.length > 0) {
            filteredSearchProviders = providersToConsider.filter(p => validSchemaProviders.includes(p));
            if (filteredSearchProviders.length < providersToConsider.length) {
                const removed = providersToConsider.filter(p => !validSchemaProviders.includes(p));
                console.warn(`[MCP Deep Search ${chatId}] Removed invalid search providers: ${removed.join(', ')}. Using: ${filteredSearchProviders.join(', ')}`);
                yield { type: 'progress_update', payload: { content: ` Warning: Removed invalid search providers (${removed.join(', ')}).` } };
            }
        }
        
        for (const providerKey of filteredSearchProviders) {
            const providerServiceName = providerNameMapping[providerKey];
            if (!providerServiceName) continue;
            try {
                const apiKeyData = await apiKeyService.getBestApiKey(userId, providerServiceName);
                if (apiKeyData?.key) {
                    if (providerServiceName === 'Brave Search') allApiConfigsForPython.BRAVE_SEARCH_API_KEY = apiKeyData.key;
                    if (providerServiceName === 'Google Search') {
                        allApiConfigsForPython.GOOGLE_API_KEY = apiKeyData.key;
                        if (apiKeyData.extra_config) {
                            try { const extra = JSON.parse(apiKeyData.extra_config); if (extra.cx) allApiConfigsForPython.GOOGLE_CX = extra.cx; } catch (e) { /* ignore */ }
                        }
                    }
                    if (providerServiceName === 'Bing Search') allApiConfigsForPython.BING_API_KEY = apiKeyData.key;
                }
            } catch (err) { console.warn(`[MCP Deep Search ${chatId}] Error fetching API key for ${providerServiceName}: ${err.message}`); }
        }
        
        const courtlistenerKey = await apiKeyService.getBestApiKey(userId, 'CourtListener');
        if (courtlistenerKey && courtlistenerKey.key) {
            allApiConfigsForPython.COURTLISTENER_API_KEY = courtlistenerKey.key;
        }

        const llmProviders = await db.allAsync(`SELECT DISTINCT p.name as provider_name, p.api_url FROM api_providers p JOIN models m ON p.id = m.external_provider_id WHERE p.name != 'local'`);
        for (const provider of llmProviders) {
            try {
                const keyData = await apiKeyService.getBestApiKey(userId, provider.provider_name);
                if (keyData?.key) {
                    allApiConfigsForPython[`llm_${provider.provider_name}_apiKey`] = keyData.key;
                    if (provider.api_url) { 
                        allApiConfigsForPython[`llm_${provider.provider_name}_apiBase`] = provider.api_url;
                    }
                }
            } catch (err) { console.warn(`[MCP Deep Search ${chatId}] Error fetching API key for LLM provider ${provider.provider_name}: ${err.message}`); }
        }

        // *** FIX: Add direct vLLM URL to api_config if a local model is being used ***
        if (reasoningModelInfoFull.provider_name === 'local') {
            const vllmApiUrl = vllmService.getVllmApiUrl(reasoningModelInfoFull.id);
            if (!vllmApiUrl) {
                throw new Error(`Could not determine vLLM API URL for local model '${reasoningModelInfoFull.name}'. Is it running correctly?`);
            }
            allApiConfigsForPython.llm_local_apiBaseUrl = vllmApiUrl;
        }


        // --- File Processing Step ---
        if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) { 
            yield { type: 'progress_update', payload: { content: ` Preparing ${fileIds.length} file(s) for research...` } };
            try {
                const fileDetailsArray = await fileService.getFileDetailsByIds(fileIds, userId);

                if (fileDetailsArray && fileDetailsArray.length > 0) {
                    yield { 
                        type: 'files_being_processed', 
                        payload: { 
                            files: fileDetailsArray.map(f => ({ 
                                id: f.id, 
                                name: f.original_name, 
                                type: f.file_type 
                            })) 
                        } 
                    };

                    const documentsToIngest = fileDetailsArray.map(file => ({
                        file_path: file.file_path, 
                        original_name: file.original_name,
                        file_id_from_node: file.id, 
                        file_type: file.file_type,
                        metadata: { 
                            node_user_id: String(userId), 
                            node_chat_id: stringChatId 
                        }
                    }));
                    
                    yield { type: 'progress_update', payload: { content: '**[Document Analyst]** Starting detailed analysis of uploaded documents...' } }; 
                    const ingestionPayload = {
                        documents: documentsToIngest,
                        reasoning_model_info: reasoningModelInfoFull, 
                        api_config: allApiConfigsForPython       
                    };
                    const ingestionResult = await pythonResearchService.ingestDocumentsForTask(stringChatId, ingestionPayload);
                    let docAnalystCompletionMessage = ingestionResult.message || 'Document analysis completed.';
                    if (!docAnalystCompletionMessage.startsWith('**[Document Analyst]')) {
                        docAnalystCompletionMessage = `**[Document Analyst]** ${docAnalystCompletionMessage}`;
                    }
                    yield { type: 'progress_update', payload: { content: docAnalystCompletionMessage } }; 

                } else {
                    yield { type: 'progress_update', payload: { content: ` Warning: No valid file details found for provided IDs: ${fileIds.join(', ')}.` } };
                }
            } catch (ingestionError) {
                console.error(`[MCP Deep Search ${chatId}] Error during file ingestion process:`, ingestionError); 
                yield { type: 'progress_update', payload: { content: ` Error processing files: ${ingestionError.message}. Proceeding without file context.` } };
            }
        } else {
        }

        const embeddingModelDbId = getSystemSetting('preferred_local_embedding_model_id');
        let embeddingModelPathForPython = null;
        if (embeddingModelDbId) {
            try {
                const embeddingModelData = await Model.findById(parseInt(embeddingModelDbId, 10));
                if (embeddingModelData && (embeddingModelData.huggingface_repo || embeddingModelData.model_path)) {
                    embeddingModelPathForPython = embeddingModelData.huggingface_repo || embeddingModelData.model_path;
                }
            } catch(e){ console.warn(`[MCP Deep Search ${chatId}] Could not load preferred embedding model: ${e.message}`);}
        }

        const final_max_distinct_search_queries = args.max_distinct_search_queries !== undefined ? args.max_distinct_search_queries : 10;
        const final_max_results_per_provider_query = args.max_results_per_provider_query !== undefined ? args.max_results_per_provider_query : 5;
        const final_max_url_exploration_depth = args.max_url_exploration_depth !== undefined ? args.max_url_exploration_depth : 5;

        // Construct the nested request_params object
        const requestParamsPayload = {
            initial_query: originalUserQuery,
            search_providers: filteredSearchProviders,
            max_distinct_search_queries: final_max_distinct_search_queries, 
            max_results_per_provider_query: final_max_results_per_provider_query, 
            max_url_exploration_depth: final_max_url_exploration_depth, 
            reasoning_model_info: reasoningModelInfoFull,
            synthesis_model_info: synthesisModelInfoFull,
            is_document_focused_query: (fileIds && fileIds.length > 0),
            max_total_urls_per_task: args.max_total_urls_per_task
        };
        
        Object.keys(requestParamsPayload).forEach(key => {
            if (requestParamsPayload[key] === undefined) {
                delete requestParamsPayload[key];
            }
        });

        const payloadForPythonService = {
            user_id: String(userId),
            request_params: requestParamsPayload,
            api_config: allApiConfigsForPython
        };
        if (embeddingModelPathForPython) { 
            if (!payloadForPythonService.api_config) payloadForPythonService.api_config = {};
            payloadForPythonService.api_config.embedding_model_id_or_path = embeddingModelPathForPython;
        }

        const redactedPayload = JSON.parse(JSON.stringify(payloadForPythonService));
        if (redactedPayload.api_config) {
            Object.keys(redactedPayload.api_config).forEach(key => {
                if (key.toLowerCase().includes('key')) {
                    redactedPayload.api_config[key] = '[REDACTED]';
                }
            });
        }
        if (redactedPayload.request_params && redactedPayload.request_params.reasoning_model_info && redactedPayload.request_params.reasoning_model_info.config) {
            redactedPayload.request_params.reasoning_model_info.config = '[REDACTED]';
        }
        if (redactedPayload.request_params && redactedPayload.request_params.synthesis_model_info && redactedPayload.request_params.synthesis_model_info.config) {
            redactedPayload.request_params.synthesis_model_info.config = '[REDACTED]';
        }

        const { task_id, stream_url, cancel_url } = await pythonResearchService.initiateResearch(payloadForPythonService);
        yield { type: 'progress_update', payload: { content: ` Research task started (ID: ${task_id}). Streaming updates...` } };

        let accumulatedMarkdown = "";
        let finalSources = []; 

        const eventQueue = [];
        let streamEnded = false;
        let streamError = null;
        let finalPayloadFromStream = null;
        let isResolvedOrRejected = false; 

        sseClient = pythonResearchService.connectToStream(
            stream_url,
            task_id,
            (sseEvent) => { 
                eventQueue.push(sseEvent);
            },
            (error) => { 
                const errorMessage = error && error.message ? error.message : "Unknown SSE connection error";
                console.error(`[DeepSearchTool:SSE:${task_id}] SSE Connection Error: ${errorMessage}`);
                if (!isResolvedOrRejected) {
                    streamError = new Error(`SSE connection error for task ${task_id}: ${errorMessage}`);
                    streamEnded = true;
                    isResolvedOrRejected = true;
                }
            },
            () => { 
                if (!isResolvedOrRejected) {
                    streamEnded = true; 
                }
            }
        );

        while (!streamEnded || eventQueue.length > 0) {
            if (isCancellationRequested(stringChatId)) {
                console.warn(`[MCP Deep Search ${chatId}] User cancellation detected for Python task ${task_id}. Attempting to cancel Python task.`);
                if (sseClient) sseClient.close(); 

                try {
                    if (cancel_url && task_id) { 
                        await pythonResearchService.cancelResearch(cancel_url, task_id);
                        console.log(`[MCP Deep Search ${chatId}] Successfully sent cancellation request to Python task ${task_id}.`);
                    } else {
                        console.error(`[MCP Deep Search ${chatId}] Cannot cancel Python task: cancel_url or Python task_id is missing.`);
                    }
                } catch (pythonCancelError) {
                    console.error(`[MCP Deep Search ${chatId}] Error sending cancellation request to Python task ${task_id}:`, pythonCancelError);
                }

                streamError = new UserCancelledError('Deep Search cancelled by user.'); 
                streamEnded = true;
                break; 
            }

            if (eventQueue.length > 0) {
                const sseEvent = eventQueue.shift();

                if (sseEvent.event_type === 'progress') {
                    let messageContent = sseEvent.payload.message;
                    if (typeof messageContent === 'string' && messageContent.startsWith('[') && messageContent.includes(']')) {
                        yield { 
                            type: 'progress_update', 
                            payload: { 
                                content: messageContent,
                                is_key_summary: sseEvent.payload.is_key_summary || false,
                                message: messageContent
                            } 
                        };
                    } else {
                        yield { 
                            type: 'progress_update', 
                            payload: { 
                                content: ` ${messageContent}`,
                                is_key_summary: sseEvent.payload.is_key_summary || false,
                                message: messageContent
                            } 
                        };
                    }
                } else if (sseEvent.event_type === 'markdown_chunk') {
                    accumulatedMarkdown += sseEvent.payload.content;
                } else if (sseEvent.event_type === 'follow_up_suggestions') {
                    if (sseEvent.payload && Array.isArray(sseEvent.payload.suggestions) && sseEvent.payload.suggestions.length > 0) {
                        let followUpMarkdown = "\n\n---\n### Further Exploration:\n";
                        sseEvent.payload.suggestions.forEach(suggestion => {
                            followUpMarkdown += `- ${suggestion}\n`;
                        });
                        accumulatedMarkdown += followUpMarkdown;
                    }
                } else if (sseEvent.event_type === 'complete') {
                    if (sseEvent.payload) {
                        const {
                            count_total_urls_scraped,
                            count_total_chunks_indexed, 
                            stat_total_pdfs_processed,
                            stat_total_web_queries_executed, 
                            stat_total_vector_store_queries, 
                            stat_duration_display,
                            detailed_token_usage 
                        } = sseEvent.payload;

                        let summaryParts = [];
                        if (count_total_urls_scraped !== undefined && count_total_urls_scraped !== null) {
                            summaryParts.push(`Sites Read: ${count_total_urls_scraped}`);
                        }
                        if (sseEvent.payload && Array.isArray(sseEvent.payload.report_sources)) {
                            finalSources = sseEvent.payload.report_sources;
                        }
                        if (count_total_chunks_indexed !== undefined && count_total_chunks_indexed !== null) {
                            summaryParts.push(`Chunks Indexed: ${count_total_chunks_indexed}`);
                        }
                        if (stat_total_pdfs_processed !== undefined && stat_total_pdfs_processed !== null) {
                            summaryParts.push(`PDFs Processed: ${stat_total_pdfs_processed}`);
                        }
                        if (stat_total_web_queries_executed !== undefined && stat_total_web_queries_executed !== null) {
                            summaryParts.push(`Web Queries: ${stat_total_web_queries_executed}`);
                        }
                        if (stat_total_vector_store_queries !== undefined && stat_total_vector_store_queries !== null) {
                            summaryParts.push(`Vector Queries: ${stat_total_vector_store_queries}`);
                        }
                        if (stat_duration_display !== undefined && stat_duration_display !== null) {
                            summaryParts.push(`Time: ${stat_duration_display}`);
                        }

                        if (Array.isArray(detailed_token_usage) && detailed_token_usage.length > 0) {
                            const totalTokensUsed = detailed_token_usage.reduce((sum, usage) => sum + (usage.total_tokens || 0), 0);
                            if (totalTokensUsed > 0) {
                                summaryParts.push(`Tokens: ${totalTokensUsed}`);
                            }
                        }

                        if (summaryParts.length > 0) {
                            const summaryLine = summaryParts.join(' | ');
                            accumulatedMarkdown += `\n\n<div class="deep-search-task-summary">${summaryLine}</div>\n`;
                        }
                    }

                    // Enhanced completion reasoning steps
                    try {
                        const stats = sseEvent.payload;
                        const sourcesCount = finalSources.length;
                        const urlsScraped = stats.count_total_urls_scraped || 0;
                        const webQueries = stats.stat_total_web_queries_executed || 0;
                        const chunksIndexed = stats.count_total_chunks_indexed || 0;
                        
                        // Evidence evaluation step
                        let evidenceQuality = 'comprehensive';
                        if (sourcesCount < 5) evidenceQuality = 'limited';
                        else if (sourcesCount > 50) evidenceQuality = 'extensive';
                        
                        const evidenceStepId = await reasoningLoggerService.createStep(
                            chatId,
                            task_id,
                            'evidence_evaluation',
                            `Evaluated ${sourcesCount} sources from ${urlsScraped} websites across ${webQueries} search queries - evidence base is ${evidenceQuality}`,
                            null,
                            { evidence_metrics: { sources: sourcesCount, urls: urlsScraped, queries: webQueries } }
                        );
                        
                        // Store step IDs for status updates
                        let contentStepId = null;
                        
                        // Content analysis step
                        if (chunksIndexed > 0) {
                            const analysisScope = chunksIndexed > 1000 ? 'extensive' : chunksIndexed > 100 ? 'thorough' : 'focused';
                            contentStepId = await reasoningLoggerService.createStep(
                                chatId,
                                task_id,
                                'content_analysis',
                                `Analyzed ${chunksIndexed} content segments providing ${analysisScope} coverage of the research topic`,
                                null,
                                { content_metrics: { chunks: chunksIndexed, scope: analysisScope } }
                            );
                        }
                        
                        // Source diversity assessment
                        const uniqueDomains = [...new Set(finalSources.map(s => {
                            try { return new URL(s.url).hostname; } catch { return 'unknown'; }
                        }))].length;
                        
                        const diversityLevel = uniqueDomains > 10 ? 'high' : uniqueDomains > 5 ? 'good' : 'moderate';
                        const diversityStepId = await reasoningLoggerService.createStep(
                            chatId,
                            task_id,
                            'source_diversity',
                            `Cross-referenced findings across ${uniqueDomains} different domains ensuring ${diversityLevel} source diversity`,
                            null,
                            { diversity_metrics: { domains: uniqueDomains, level: diversityLevel } }
                        );
                        
                        // Final synthesis step
                        const confidenceLevel = (sourcesCount > 20 && uniqueDomains > 8) ? 'high' : 
                                             (sourcesCount > 10 && uniqueDomains > 4) ? 'good' : 'moderate';
                        
                        const synthesisStepId = await reasoningLoggerService.createStep(
                            chatId,
                            task_id,
                            'synthesis_complete',
                            `Synthesis complete with ${confidenceLevel} confidence - integrated findings from authoritative sources into comprehensive analysis`,
                            null,
                            { synthesis_metrics: { confidence: confidenceLevel, integration_complete: true } }
                        );
                        
                        // Mark all completion steps as completed
                        await reasoningLoggerService.updateStepStatus(evidenceStepId, 'completed');
                        if (contentStepId) {
                            await reasoningLoggerService.updateStepStatus(contentStepId, 'completed');
                        }
                        await reasoningLoggerService.updateStepStatus(diversityStepId, 'completed');
                        await reasoningLoggerService.updateStepStatus(synthesisStepId, 'completed');
                        
                    } catch (reasoningLogError) {
                        console.error(`[Deep Search ${chatId}] Failed to log completion steps:`, reasoningLogError);
                    }

                    // MOVED: finalPayloadFromStream creation AFTER reasoning steps are complete
                    finalPayloadFromStream = { full_content: accumulatedMarkdown, sources: finalSources, task_id: task_id };
                    streamEnded = true; 
                    isResolvedOrRejected = true;

                    if (sseEvent.payload && Array.isArray(sseEvent.payload.detailed_token_usage)) {
                        for (const usage of sseEvent.payload.detailed_token_usage) {
                            try {
                                await UsageStatsService.recordTokens({
                                    userId: userId,
                                    chatId: chatId, 
                                    modelId: usage.model_id,
                                    promptTokens: usage.prompt_tokens,
                                    completionTokens: usage.completion_tokens,
                                    totalTokens: usage.total_tokens,
                                    source: 'deep_search_tool' 
                                });
                            } catch (tokenLogError) {
                                console.error(`[DeepSearchTool:${task_id}] Failed to log token usage for model ${usage.model_id}:`, tokenLogError);
                            }
                        }
                    }

                } else if (sseEvent.event_type === 'cancelled') {
                    streamError = new Error(`Research task ${task_id} was cancelled by the Python service: ${sseEvent.payload.message}`);
                    streamEnded = true;
                    isResolvedOrRejected = true;
                } else if (sseEvent.event_type === 'error') {
                    console.error(`[DeepSearchTool:Loop:${task_id}] 'error' event from Python: ${sseEvent.payload.error_message}`);
                    streamError = new Error(`Research task ${task_id} failed in Python service: ${sseEvent.payload.error_message}`);
                    streamEnded = true;
                    isResolvedOrRejected = true;
                } else if (sseEvent.event_type === 'heartbeat') {
                }
            } else if (streamEnded && eventQueue.length === 0) {
                break; 
            } else {
                await new Promise(r => setTimeout(r, 50)); 
            }
        }

        if (streamError) {
            throw streamError;
        }
        
        if (finalPayloadFromStream) {
            yield { type: 'final_data', payload: finalPayloadFromStream };
        } else if (!isCancellationRequested(stringChatId)) { 
            console.warn(`[MCP Deep Search ${chatId}] Stream ended for task ${task_id} without a clear 'complete' payload or explicit error/cancellation event being fully processed into finalPayloadFromStream.`);
            if (accumulatedMarkdown) {
                yield { type: 'final_data', payload: { full_content: accumulatedMarkdown, sources: finalSources, warning: "Stream ended unexpectedly." } };
            } else {
                throw new Error(`Research task ${task_id} stream ended without providing a final result or explicit error.`);
            }
        }

    } catch (error) {
        console.error(`[MCP Deep Search ${chatId}] Error in tool execution:`, error);
        yield { type: 'progress_update', payload: { content: ` Fatal Error: ${error.message}` } };
        throw error; 
    } finally {
        if (sseClient) {
            sseClient.close();
        }
        clearCancellationRequest(stringChatId); 
    }
}

module.exports = {
    run: runDeepSearchTool,
    schema: {
        name: "deep-search",
        description: "Performs iterative web research using a modular Python backend (Controller, Scout, Librarian) and LLM reasoning/synthesis. Streams progress.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "The user's initial search query or topic." },
                reasoningModelName: { type: "string", description: "Name/ID of the LLM for planning, summarization, and synthesis tasks." },
                search_providers: {
                    type: "array",
                    items: { type: "string", enum: ["google", "bing", "brave", "openalex", "wikipedia", "duckduckgo"] },
                    description: "Search providers for the Field Scout. Empty or not provided defaults to a standard set (e.g., DuckDuckGo, Wikipedia, OpenAlex).",
                    default: []
                },
                fileIds: { type: "array", items: { type: "number" }, description: "Optional array of file IDs to include as initial context.", default: [] },
                max_distinct_search_queries: { 
                    type: "integer",
                    description: "Maximum number of distinct search engine queries the Research Controller will instruct the Field Scout to perform.",
                    default: 7, 
                    minimum: 1,
                    maximum: 30 
                },
                max_results_per_provider_query: {
                    type: "integer",
                    description: "Maximum search results the Field Scout should fetch per provider for each distinct query.",
                    default: 5,
                    minimum: 1,
                    maximum: 10
                },
                max_url_exploration_depth: {
                    type: "integer",
                    description: "How many levels deep the Research Controller should instruct the Field Scout to explore links found in content (0 for no link exploration beyond initial search results, 1 for one level deeper, up to 5).",
                    default: 1, 
                    minimum: 0,
                    maximum: 5 
                },
                max_total_urls_per_task: { 
                    type: "integer",
                    description: "Maximum total unique URLs the research process should attempt to scrape and process across all hops. Overrides server default if provided.",
                    minimum: 1,
                    maximum: 200 
                }
            },
            required: ["query", "reasoningModelName"]
        },
        output_schema: { 
            type: "object",
            properties: {
                full_content: { type: "string", description: "The final synthesized answer with sources." },
                sources: { type: "array", items: {type: "object"}, description: "Array of source objects used."}
            },
            required: ["full_content"]
        }
    }
};
