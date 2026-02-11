// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import apiService from './apiService';
import chatApiService from './chatApiService';
import tokenProcessor from '../utils/tokenProcessor';

const CHAT_ENDPOINTS = {
  CHATS: '/chat', 
  CHAT: (id) => `/chat/${id}`,
  MESSAGES: (chatId) => `/chat/${chatId}/messages`,
  CONTEXT_STATUS: '/chat/context_status', 
  MONTHLY_TOKEN_USAGE: '/chats/usage/monthly' 
};

const chatService = {
  /**
   * Get all chats for current user
   * @returns {Promise<Array>} List of chats
   */
  getChats: async () => {
    try {
      const response = await apiService.get(CHAT_ENDPOINTS.CHATS);
      return response.data || [];
    } catch (error) {
      console.error('Error getting chats:', error);
      throw error;
    }
  },

  /**
   * Get a single chat with messages
   * @param {string|number} chatId - ID of the chat to retrieve
   * @returns {Promise<Object>} Chat with messages
   */
  getChat: async (chatId) => {
    try {
      const response = await apiService.get(CHAT_ENDPOINTS.CHAT(chatId));
      const chatData = response.data;

      if (chatData && chatData.messages) {
        chatData.messages.forEach(message => {
          if (message.mcp_metadata && typeof message.mcp_metadata === 'string') {
            try {
              message.mcp_metadata = JSON.parse(message.mcp_metadata);
            } catch (e) {
              console.error('Failed to parse mcp_metadata:', e);
            }
          }
        });
      }

      return chatData || null;
    } catch (error) {
      console.error(`Error getting chat ${chatId}:`, error);
      throw error;
    }
  },

  /**
   * Create a new chat
   * @param {Object} chatData - Chat creation data
   * @param {number} chatData.modelId - ID of the model to use
   * @param {string} [chatData.title] - Optional title for the chat
   * @param {string} [chatData.initialMessage] - Optional initial message
   * @param {Array} [chatData.files] - Optional files to attach to initial message
   * @returns {Promise<Object>} Created chat
   */
  createChat: async (chatData) => {
    try {
      const payload = {
        modelId: chatData.modelId,
        title: chatData.title
      };
      
      if (chatData.initialMessage) {
        payload.initialMessage = chatData.initialMessage;
      }
      
      if (chatData.files && chatData.files.length > 0) {
        payload.files = chatData.files.map(file => 
          typeof file === 'object' ? file.id : file
        );
      }
      
      const response = await apiService.post(CHAT_ENDPOINTS.CHATS, payload);
      return response.data || null;
    } catch (error) {
      console.error('Error creating chat:', error);
      throw error;
    }
  },

  /**
   * Update a chat (e.g., change title)
   * @param {string|number} chatId - ID of the chat to update
   * @param {Object} chatData - Data to update
   * @param {string} chatData.title - New title for the chat
   * @returns {Promise<Object>} Updated chat
   */
  updateChat: async (chatId, chatData) => {
    try {
      const response = await apiService.put(CHAT_ENDPOINTS.CHAT(chatId), chatData);
      return response.data || null;
    } catch (error) {
      console.error(`Error updating chat ${chatId}:`, error);
      throw error;
    }
  },

  /**
   * Delete a chat
   * @param {string|number} chatId - ID of the chat to delete
   * @returns {Promise<Object>} Delete confirmation
   */
  deleteChat: async (chatId) => {
    try {
      return await apiService.delete(CHAT_ENDPOINTS.CHAT(chatId));
    } catch (error) {
      console.error(`Error deleting chat ${chatId}:`, error);
      throw error;
    }
  },

  /**
   * Send a message to a chat and get AI response
   * @param {string|number} chatId - ID of the chat to message
   * @param {string} content - Message content to send
   * @param {Array} [files] - Optional array of file objects or file IDs to attach
   * @param {boolean} [isImagePrompt=false] - Flag to indicate if this is an image generation prompt
   * @returns {Promise<Object>} Updated chat with new messages
   */
  sendMessage: async (chatId, content, files = [], isImagePrompt = false) => {
    try {
      const payload = { content };
      
      if (files && files.length > 0) {
        payload.files = files.map(file => 
          typeof file === 'object' ? file.id : file
        );
      }

      if (isImagePrompt) {
        payload.isImagePrompt = true;
      }
      
      const response = await chatApiService.post(CHAT_ENDPOINTS.MESSAGES(chatId), payload);
      return response || null;
    } catch (error) {
      console.error(`Error sending message to chat ${chatId}:`, error);
      throw error;
    }
  },

  /**
   * Check if a file's type is supported for AI processing
   * @param {string} fileType - MIME type of the file
   * @returns {boolean} Whether the file type is supported
   */
  isSupportedFileType: (fileType) => {
    const supportedTypes = [
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json',
      'text/javascript',
      'text/html',
      'text/css',
      'text/x-python',
      'text/x-java',
      'text/x-c',
      'text/x-cpp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    return supportedTypes.includes(fileType);
  },
  
  /**
   * Format a timestamp for display in chat
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted time string
   */
  formatMessageTime: (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
      return tokenProcessor.formatDateForDisplay(timestamp, {
        hour: '2-digit',
        minute: '2-digit',
        year: undefined,
        month: undefined,
        day: undefined
      });
    } else {
      return tokenProcessor.formatDateForDisplay(timestamp, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  },
  
  /**
   * Get a readable format for file size display
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize: (bytes) => {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  },
  
  /**
   * Get an icon character for a file based on its type
   * @param {string} fileType - MIME type of the file
   * @returns {string} Icon character
   */
  getFileIcon: (fileType) => {
    const iconMap = {
      'text/plain': '📄',
      'text/csv': '📊',
      'text/markdown': '📝',
      'application/json': '📋',
      'text/javascript': '💻',
      'text/html': '🌐',
      'text/css': '🎨',
      'text/x-python': '🐍',
      'application/pdf': '📑',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
      'image/jpeg': '🖼️',
      'image/png': '🖼️',
      'image/gif': '🖼️',
      'default': '📁'
    };
    
    return iconMap[fileType] || iconMap['default'];
  },

  /**
   * Get context window status for a given model and message history
   * @param {number} modelId - ID of the model
   * @param {Array<object>} messages - Array of message objects
   * @returns {Promise<object>} Validation result object
   */
  getContextStatus: async (modelId, messages) => {
    try {
      const payload = { modelId, messages };
      const response = await apiService.post(CHAT_ENDPOINTS.CONTEXT_STATUS, payload);
      return response.data || { valid: false, error: 'Failed to get context status' };
    } catch (error) {
      console.error('Error getting context status:', error);
      return {
        valid: false,
        error: error.response?.data?.message || 'Error checking context status',
        estimatedTokens: 0,
        maxTokens: 0
      };
    }
  },

  /**
   * Runs a tool within an existing chat.
   * @param {string|number} chatId - ID of the chat.
   * @param {string} toolName - Name of the tool to run.
   * @param {object} args - Arguments for the tool.
   * @returns {Promise<Object>} API response (usually a 202 Accepted).
   */
  runToolInChat: async (chatId, toolName, args) => {
    try {
      const endpoint = `/api/chats/${chatId}/run-tool`; 
      const payload = { toolName, args };
      const response = await apiService.post(endpoint, payload);
      return response.data; 
    } catch (error) {
      console.error(`Error running tool ${toolName} in chat ${chatId}:`, error);
      throw error;
    }
  },

  /**
   * Get monthly token usage for the current user.
   * @returns {Promise<Object>} Object with token usage data (totalInputTokens, totalOutputTokens, totalTokens)
   */
  getMonthlyTokenUsage: async () => {
    try {
      const response = await apiService.get(CHAT_ENDPOINTS.MONTHLY_TOKEN_USAGE);
      return response.data || { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 }; 
    } catch (error) {
      console.error('Error getting monthly token usage:', error);
      return { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0 };
    }
  }
};

export default chatService;
