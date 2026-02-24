// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../models/db'); 
const providerManager = require('../services/providers'); 
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Model = require('../models/Model'); 
const { getSystemSetting } = require('../config/systemConfig');
const { UserCancelledError } = require('../utils/errorUtils'); 
const AgentService = require('../services/agents/AgentService'); 
const apiKeyService = require('../services/apiKeyService'); 
const MCPService = require('../services/agents/MCPService'); 

/**
 * Get MCP agents (models that support agent capabilities)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAgents = async (req, res) => {
  try {
    const mcpProvider = providerManager.getProvider('MCP');

    if (!mcpProvider) {
      return res.status(404).json({
        success: false,
        message: 'MCP provider not found'
      });
    }

    const models = await db.allAsync(`
      SELECT m.id, m.name, m.description, m.context_window, m.external_model_id,
             ap.name as provider_name
      FROM models m
      LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
      WHERE m.is_active = 1
      AND (ap.name = 'Scalytics MCP' OR ap.name = 'MCP')
    `);

    const agentsWithCapabilities = await Promise.all(models.map(async (model) => {
      let capabilities = [];
      try {
        if (mcpProvider.getModelCapabilities) {
          capabilities = await mcpProvider.getModelCapabilities(model.external_model_id);
        }
      } catch (error) {
        console.error(`Error fetching capabilities for model ${model.id}:`, error);
      }
      return {
        ...model,
        capabilities: capabilities,
        is_agent: true,
        supported_tools: capabilities.tools || []
      };
    }));

    res.status(200).json({
      success: true,
      count: agentsWithCapabilities.length,
      data: agentsWithCapabilities
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching agents'
    });
  }
};

/**
 * Get available MCP tools
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getMCPTools = async (req, res) => {
  try {
    const mcpProvider = providerManager.getProvider('MCP');

    if (!mcpProvider) {
      return res.status(404).json({
        success: false,
        message: 'MCP provider not found'
      });
    }

    let tools = [];
    if (mcpProvider.getAvailableTools) {
      tools = await mcpProvider.getAvailableTools();
    } else {
      tools = [
        // { id: 'web-search', name: 'Web Search', description: 'Search the web for information' },
        // { id: 'code-interpreter', name: 'Code Interpreter', description: 'Execute code to solve problems' },
        // { id: 'data-analysis', name: 'Data Analysis', description: 'Analyze data files uploaded by the user' },
        // { id: 'image-recognition', name: 'Image Recognition', description: 'Analyze and describe images' }
      ];
    }

    res.status(200).json({
      success: true,
      count: tools.length,
      data: tools
    });
  } catch (error) {
    console.error('Get MCP tools error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching MCP tools'
    });
  }
};

/**
 * Get agent capabilities
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAgentCapabilities = async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = await db.getAsync(`
      SELECT m.id, m.name, m.description, m.external_model_id, m.context_window,
             ap.name as provider_name
      FROM models m
      LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
      WHERE m.id = ? AND m.is_active = 1
    `, [agentId]);

    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const mcpProvider = providerManager.getProvider('MCP');
    if (!mcpProvider) {
      return res.status(404).json({ success: false, message: 'MCP provider not found' });
    }

    let capabilities = {};
    try {
      if (mcpProvider.getModelCapabilities) {
        capabilities = await mcpProvider.getModelCapabilities(agent.external_model_id);
      } else {
        capabilities = {
          context_window: agent.context_window || 8192,
          supports_functions: true, supports_vision: false, supports_tools: true,
          // tools: ['web-search', 'code-interpreter', 'data-analysis']
          tools: []
        };
      }
    } catch (error) {
      console.error('Error fetching capabilities for agent %s:', agentId, error);
      capabilities = {
        context_window: agent.context_window || 8192,
        supports_functions: true, supports_tools: true,
        // tools: ['web-search', 'code-interpreter']
        tools: []
      };
    }

    res.status(200).json({ success: true, data: { ...agent, capabilities } });
  } catch (error) {
    console.error('Get agent capabilities error:', error);
    res.status(500).json({ success: false, message: 'Error fetching agent capabilities' });
  }
};

/**
 * Start a chat with selected agents/tools
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.startAgentChat = async (req, res) => {
  try {
    const { agentIds, title } = req.body;
    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide at least one agent ID' });
    }
    const primaryAgent = await db.getAsync(`SELECT m.id, m.name FROM models m WHERE m.id = ? AND m.is_active = 1`, [agentIds[0]]);
    if (!primaryAgent) {
      return res.status(404).json({ success: false, message: 'Primary agent not found' });
    }
    const chatId = await Chat.create({ userId: req.user.id, modelId: primaryAgent.id, title: title || `Chat with ${primaryAgent.name}` });
    await db.runAsync('INSERT INTO chat_metadata (chat_id, key, value) VALUES (?, ?, ?)', [chatId, 'selected_agents', JSON.stringify(agentIds)]);
    let systemMessage = `This chat uses the Scalytics MCP agent "${primaryAgent.name}".`;
    if (agentIds.length > 1) systemMessage += ` Additional tools have been enabled: ${agentIds.slice(1).join(', ')}.`;
    await Message.create({ chat_id: chatId, role: 'system', content: systemMessage });
    const chat = await Chat.findById(chatId);
    res.status(201).json({ success: true, message: 'Agent chat created successfully', data: chat });
  } catch (error) {
    console.error('Start agent chat error:', error);
    res.status(500).json({ success: false, message: 'Error starting agent chat' });
  }
};

/**
 * Handle Deep Search Request
 * Orchestrates fetching search results, filtering, and AI analysis.
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.handleDeepSearchRequest = async (req, res) => {
  const { query, title, fileIds } = req.body;
  const userId = req.user?.id;

  // --- Basic Validation ---
  if (!userId) {
    return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }
  if (!query && (!fileIds || fileIds.length === 0)) {
    return res.status(400).json({ success: false, message: 'Search query or file upload is required.' });
  }

  // --- Fetch User Tool Config for 'deep-search' ---
  let reasoningModelName; 
  let actualModelIdentifier; 
  try {
    const configRow = await db.getAsync(
      'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
      [userId, 'deep-search'] 
    );

    if (!configRow || !configRow.config) {
      console.warn(`[Deep Search Ctrl] User ${userId} attempted deep search without configuration for 'deep-search'.`);
      return res.status(400).json({ success: false, message: 'Deep Search configuration not found. Please configure the tool models in the Agent settings.' });
    }

    const toolConfig = JSON.parse(configRow.config);
    reasoningModelName = toolConfig.reasoningModelName;

    // Validate reasoningModelName
    if (!reasoningModelName || typeof reasoningModelName !== 'string' || reasoningModelName.trim() === '') {
      console.warn(`[Deep Search Ctrl] User ${userId} has incomplete configuration (missing or invalid reasoningModelName). Config:`, toolConfig);
      return res.status(400).json({ success: false, message: 'Deep Search configuration is incomplete or invalid. Please configure the reasoning model.' });
    }
    reasoningModelName = reasoningModelName.trim(); 

    // --- Resolve Model ID to Name/External ID if necessary ---
    actualModelIdentifier = reasoningModelName; 
    if (/^\d+$/.test(reasoningModelName)) { 
        try {
            const modelRecord = await db.getAsync(
                'SELECT name, external_model_id FROM models WHERE id = ?',
                [parseInt(reasoningModelName, 10)]
            );
            if (!modelRecord) {
                throw new Error(`Configured reasoning model ID ${reasoningModelName} not found in the database.`);
            }
            actualModelIdentifier = modelRecord.external_model_id || modelRecord.name;
        } catch (resolveError) {
            console.error(`[Deep Search Ctrl] Error resolving reasoning model ID ${reasoningModelName}:`, resolveError);
            return res.status(500).json({ success: false, message: `Failed to resolve configured reasoning model: ${resolveError.message}` });
        }
    } else {
    }

  } catch (err) {
    console.error(`[Deep Search Ctrl] Error fetching/parsing/resolving tool config for user ${userId}:`, err);
    const userMessage = err instanceof SyntaxError ? 'Stored configuration is invalid.' : `Failed to load tool configuration: ${err.message}`;
     return res.status(500).json({ success: false, message: userMessage });
  }

  let chatId;
  let initialUserMessage;
  let userDefaultModelId;
  try {
    const userSettings = await db.getAsync('SELECT default_model_id FROM user_settings WHERE user_id = ?', [userId]);
    userDefaultModelId = userSettings?.default_model_id;

    if (!userDefaultModelId) {
        const systemDefault = await db.getAsync('SELECT id FROM models WHERE is_default = 1 AND is_active = 1 LIMIT 1');
        userDefaultModelId = systemDefault?.id;
    }

    if (!userDefaultModelId) {
        const anyActiveModel = await db.getAsync('SELECT id FROM models WHERE is_active = 1 LIMIT 1');
        userDefaultModelId = anyActiveModel?.id;
    }

    if (!userDefaultModelId) {
        console.error(`[Deep Search Ctrl] Could not determine a default model for user ${userId} or system.`);
        return res.status(500).json({ success: false, message: 'Could not determine a default model to create the chat.' });
    }

    const chatTitleBase = query ? query : (fileIds && fileIds.length > 0 ? `Analysis of ${fileIds.length} file(s)` : 'Deep Search Task');
    const finalChatTitle = title || `Deep Search: ${chatTitleBase.substring(0, 30)}${chatTitleBase.length > 30 ? '...' : ''}`;

    chatId = await Chat.create({ userId, modelId: userDefaultModelId, title: finalChatTitle });

    const userMessageId = await Message.create({ chat_id: chatId, role: 'user', content: query || `Initiated task with ${fileIds.length} file(s).` });
    initialUserMessage = await Message.findById(userMessageId);

    res.status(201).json({ success: true, message: 'Deep search chat created.', data: { chatId, initialUserMessage } });

  } catch (chatCreateError) {
    console.error('[Deep Search] Error creating initial chat/message:', chatCreateError);
    if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Failed to initialize deep search chat.' });
    } else {
        console.error('[Deep Search] Headers already sent, could not send chat creation error response.');
        return; 
    }
  }

  // Ensure chatId is valid before proceeding
  if (!chatId) {
      console.error('[Deep Search Ctrl] Chat ID is invalid after chat creation attempt.');
      return;
  }

  // --- Trigger the Asynchronous Internal Tool Call ---
  MCPService.callInternalTool( 
      'deep-search',       
      { 
        query,
        reasoningModelName: actualModelIdentifier, 
        fileIds
      },
      { 
      userId,
      chatId
    }
  ).catch(mcpError => {
      console.error(`[Deep Search Ctrl] Failed to trigger MCP tool 'deep-search' for chat ${chatId}:`, mcpError);
      Message.create({ chat_id: chatId, role: 'system', content: `Error: Failed to start the Deep Search process. ${mcpError.message}` }).catch(console.error);
  });

};


/**
 * Runs an internal MCP tool within the context of an existing chat.
 * @param {Object} req - Request object (expects chatId in params, toolName and args in body)
 * @param {Object} res - Response object
 */
exports.runToolInChat = async (req, res) => {
    const { chatId } = req.params;
    const { toolName, args } = req.body; // args should contain the user query, e.g., { query: "..." }
    const userId = req.user?.id;

    // --- Basic Validation ---
    if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
    }
    if (!chatId || isNaN(parseInt(chatId, 10))) {
        return res.status(400).json({ success: false, message: 'Valid Chat ID is required.' });
    }
    if (!toolName) {
        return res.status(400).json({ success: false, message: 'Tool name is required.' });
    }
    if (!args || typeof args !== 'object') {
        return res.status(400).json({ success: false, message: 'Tool arguments are required.' });
    }
    // Specific validation for deep-search query
    if (toolName === 'deep-search' && (!args.query || typeof args.query !== 'string')) {
         return res.status(400).json({ success: false, message: 'Query argument is required for deep-search tool.' });
    }

    const numericChatId = parseInt(chatId, 10);

    try {
        // --- Verify Chat Ownership ---
        const chat = await Chat.findById(numericChatId);
        if (!chat) {
            return res.status(404).json({ success: false, message: 'Chat not found.' });
        }
        if (chat.user_id !== userId) {
            return res.status(403).json({ success: false, message: 'User does not own this chat.' });
        }

        // --- Save User's Query/Trigger as a Message ---
        // Construct a user message content based on the tool and query
        let userMessageContent = `Using tool: ${toolName}`;
        if (args.query) {
            userMessageContent = args.query; // Use the query directly as the user message
        } else if (args.fileIds && args.fileIds.length > 0) {
             userMessageContent = `Initiated ${toolName} with ${args.fileIds.length} file(s).`;
        }
        // Add more specific message content generation if needed for other tools

        const userMessageId = await Message.create({
            chat_id: numericChatId,
            role: 'user',
            content: userMessageContent
        });
        const initialUserMessage = await Message.findById(userMessageId); 

        // --- Respond Immediately ---
        // Indicate that the tool process has started in the background
        res.status(202).json({
            success: true,
            message: `Tool '${toolName}' started successfully in chat ${numericChatId}.`,
            data: { chatId: numericChatId, userMessage: initialUserMessage } 
        });

        // --- Trigger Asynchronous Tool Call ---
        // Prepare context and arguments for the tool
        const toolContext = { userId, chatId: numericChatId };
        let toolArgs = { ...args }; 

        if (toolName === 'deep-search') {
            const configRow = await db.getAsync(
                'SELECT config FROM user_tool_configs WHERE user_id = ? AND tool_name = ?',
                [userId, 'deep-search']
            );
            if (!configRow || !configRow.config) throw new Error('Deep Search configuration not found.');
            const toolConfig = JSON.parse(configRow.config);
            let reasoningModelIdentifier = toolConfig.reasoningModelName; 
            // Removed the explicit check for reasoningModelIdentifier here.
            // The deep-search tool itself will handle the fallback if it's not provided.

            if (reasoningModelIdentifier && /^\d+$/.test(reasoningModelIdentifier)) { 
                 const modelRecord = await db.getAsync('SELECT name, external_model_id FROM models WHERE id = ?', [parseInt(reasoningModelIdentifier, 10)]);
                 if (!modelRecord) throw new Error(`Configured reasoning model ID ${reasoningModelIdentifier} not found.`);
                 reasoningModelIdentifier = modelRecord.external_model_id || modelRecord.name;
            }
            toolArgs.reasoningModelName = reasoningModelIdentifier; 

            if (toolConfig.search_providers) {
                toolArgs.search_providers = toolConfig.search_providers;
            }
            if (toolConfig.max_iterations !== undefined) { 
                toolArgs.max_iterations = toolConfig.max_iterations;
            }
            // fileIds are usually passed directly in req.body.args if needed for a specific run,
            // but if they were part of a saved config, they could be merged too:
            // if (toolConfig.fileIds) {
            //    toolArgs.fileIds = toolConfig.fileIds;
            // }
        }


        MCPService.callInternalTool(toolName, toolArgs, toolContext)
            .then(result => {
                // Tool finished, result already saved as message by the tool itself
                // Optionally send a final "Tool finished" system message?
                // Message.create({ chatId: numericChatId, role: 'system', content: `Tool '${toolName}' finished.` }).catch(console.error);
            })
            .catch(toolError => {
                console.error('[Agent Ctrl] Background execution of internal tool \'%s\' for chat %s failed:', toolName, numericChatId, toolError);
                let systemMessageContent;
                if (toolError instanceof UserCancelledError) {
                    // Use a more direct message for user cancellations
                    systemMessageContent = toolError.message; // e.g., "Deep Search cancelled by user."
                                                            // Or a slightly friendlier version: `Tool '${toolName}' was cancelled as requested.`
                } else {
                    systemMessageContent = `Error running tool '${toolName}': ${toolError.message}`;
                }
                Message.create({ chat_id: numericChatId, role: 'system', content: systemMessageContent }).catch(console.error);
            });

    } catch (error) {
        console.error('[Agent Ctrl] Error running tool \'%s\' in chat %s:', toolName, numericChatId, error);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: `Failed to run tool: ${error.message}` });
        }
    }
};


module.exports = exports;
