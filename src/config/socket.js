// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * WebSocket configuration, handlers, and instance export
 */
const WebSocket = require('ws');
const url = require('url');
const { db } = require('../models/db');
const bcrypt = require('bcrypt');
const { downloadManager } = require('../utils/streamDownloader');
const eventBus = require('../utils/eventBus');
const { requestCancellation } = require('../utils/cancellationManager');
const { cancelInferenceRequest } = require('../services/inferenceRouter');

let wsServer = null;

const rooms = new Map();

function joinRoom(roomName, ws) { if (!rooms.has(roomName)) { rooms.set(roomName, new Set()); } rooms.get(roomName).add(ws); }
function leaveRoom(roomName, ws) { if (rooms.has(roomName)) { rooms.get(roomName).delete(ws); if (rooms.get(roomName).size === 0) { rooms.delete(roomName); } } }

const tokenProcessor = {
  inThinkingSection: false, buffer: '',
  thinkingStartPatterns: [ '<think>', '<thinking>', '<|thinking|>', 'Alright, ', 'I need to ', 'I should ', 'Let me ', 'The user asked about ', 'First, I\'ll', 'I\'ll start by' ],
  thinkingEndPatterns: [ '</think>', '</thinking>', '</|thinking|>', 'Answer:', 'Response:' ],
  specialTags: [ '<|assistant|>' ],
  processToken: function(token) { /* ... existing logic ... */ },
  reset: function() { this.inThinkingSection = false; this.buffer = ''; },
  processCompleteMessage: function(message) { /* ... existing logic ... */ }
};
tokenProcessor.processToken = function(token) { if (!token || token.trim() === '') { return null; } this.buffer += token; if (this.buffer.length > 200) { this.buffer = this.buffer.substring(this.buffer.length - 200); } for (const tag of this.specialTags) { if (this.buffer.includes(tag)) { token = token.replace(tag, ''); if (!token || token.trim() === '') { return null; } } } for (const pattern of this.thinkingStartPatterns) { if (this.buffer.includes(pattern) && !this.inThinkingSection) { this.inThinkingSection = true; return null; } } for (const pattern of this.thinkingEndPatterns) { if (this.buffer.includes(pattern) && this.inThinkingSection) { this.inThinkingSection = false; if (pattern === 'Answer:' || pattern === 'Response:') { const answerPos = token.indexOf(pattern); if (answerPos !== -1) { const processedToken = token.substring(answerPos + pattern.length); return processedToken.trim() ? processedToken : null; } } return null; } } if (this.inThinkingSection) { return null; } return token; };
tokenProcessor.processCompleteMessage = function(message) { if (!message) return ''; this.reset(); let bestAnswer = ''; let processedMessage = message; for (const tag of this.specialTags) { processedMessage = processedMessage.replace(new RegExp(tag, 'g'), ''); } processedMessage = processedMessage.replace(/<think>[\s\S]*?<\/think>/g, ''); processedMessage = processedMessage.replace(/<thinking>[\s\S]*?<\/thinking>/g, ''); processedMessage = processedMessage.replace(/<\|thinking\|>[\s\S]*?<\/\|thinking\|>/g, ''); const answerMatch = processedMessage.match(/Answer:([\s\S]*)/); const responseMatch = processedMessage.match(/Response:([\s\S]*)/); if (answerMatch) { bestAnswer = answerMatch[1].trim(); } else if (responseMatch) { bestAnswer = responseMatch[1].trim(); } if (bestAnswer) { return bestAnswer; } const paragraphs = processedMessage.split('\n\n').filter(p => p.trim().length > 0); if (paragraphs.length > 1) { const thinkingIndicators = [ 'I need to', 'I should', 'The user', 'Let me', 'I\'ll', 'user is asking', 'need to explain', 'think about' ]; let foundThinkinginEarlier = false; for (let i = 0; i < paragraphs.length - 1; i++) { const paragraph = paragraphs[i].toLowerCase(); if (thinkingIndicators.some(indicator => paragraph.includes(indicator.toLowerCase()))) { foundThinkinginEarlier = true; break; } } if (foundThinkinginEarlier) { return paragraphs[paragraphs.length - 1].trim(); } } return processedMessage.trim(); };

function sendDownloadInfoToClient(ws, downloadId, downloadInfo) {
  if (!downloadInfo) return;
  let type = 'download:progress';
  let payload = { downloadId, progress: downloadInfo.progress || 0, bytesDownloaded: downloadInfo.bytesDownloaded || 0, totalBytes: downloadInfo.totalBytes || 0, speed: downloadInfo.speed || 0, status: downloadInfo.status || 'downloading', message: downloadInfo.message || 'Downloading...' };
  if (downloadInfo.status === 'completed') { type = 'download:complete'; payload.message = downloadInfo.message || 'Download completed'; payload.outputPath = downloadInfo.outputPath; }
  else if (downloadInfo.status === 'failed') { type = 'download:error'; payload.error = downloadInfo.error || 'Unknown error'; }
  if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type, payload })); }
  else { broadcastToRoom(`download:${downloadId}`, { type, payload }); }
}

function handleStopGeneration(payload) {
    const requestIdToStop = payload?.requestId; 
    if (requestIdToStop) {
        const success = cancelInferenceRequest(requestIdToStop);
        if (!success) {
            console.warn("[Socket] Failed to send interrupt for request ID: %s (maybe already completed)", String(requestIdToStop).replace(/\n|\r/g, ''));
        }
    } else {
        console.error("[Socket] Received stop_generation with invalid requestId: %s", String(payload?.requestId).replace(/\n|\r/g, ''));
    }
}

function handleStopDeepSearch(payload) {
    const requestId = payload?.requestId;
    if (requestId) {
        requestCancellation(requestId);
    } else {
        console.error("[Socket] Received stop_deep_search with invalid requestId: %s", String(payload?.requestId).replace(/\n|\r/g, ''));
    }
}

function handleWebSocketMessage(ws, message) {
  try {
    const data = JSON.parse(message.toString());
    const { type, payload } = data;

    if (payload && payload.clientId && !ws.clientId) {
      ws.clientId = payload.clientId;
    }

    switch (type) {
      case 'chat:subscribe':
        let chatId = String(typeof payload === 'object' ? (payload.chatId || payload.id || JSON.stringify(payload).substring(0, 20)) : payload);
        if (chatId === '[object Object]') { console.error('Invalid chat ID format received. Payload: %s', JSON.stringify(payload)); chatId = 'invalid-' + Date.now(); }
        joinRoom(`chat:${chatId}`, ws);
        break;
      case 'chat:unsubscribe':
        let unsubChatId = String(typeof payload === 'object' ? (payload.chatId || payload.id || JSON.stringify(payload).substring(0, 20)) : payload);
        if (unsubChatId === '[object Object]') { console.error('Invalid chat ID format received for unsubscribe. Payload: %s', JSON.stringify(payload)); unsubChatId = 'invalid-' + Date.now(); }
        leaveRoom(`chat:${unsubChatId}`, ws);
        break;
      case 'download:subscribe':
        const downloadId = String(typeof payload === 'object' ? payload.downloadId || payload.id || payload : payload);
        joinRoom(`download:${downloadId}`, ws);
        ws.downloadStatusRequested = true;
        const downloadInfo = downloadManager.getDownloadInfo(downloadId);
        if (downloadInfo) {
             sendDownloadInfoToClient(ws, downloadId, downloadInfo);
        }
        break;
      case 'download:unsubscribe':
        const unsubDownloadId = String(typeof payload === 'object' ? payload.downloadId || payload.id || payload : payload);
        leaveRoom(`download:${unsubDownloadId}`, ws);
        break;
      case 'download:status':
        const statusDownloadId = String(typeof payload === 'object' ? payload.downloadId || payload.id || payload : payload);
        const currentInfo = downloadManager.getDownloadInfo(statusDownloadId);
        if (currentInfo) {
            sendDownloadInfoToClient(ws, statusDownloadId, currentInfo);
        }
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', payload: { time: new Date().toISOString() } }));
        break;
      case 'stop_generation':
        handleStopGeneration(payload);
        break;
      case 'stop_deep_search':
        handleStopDeepSearch(payload);
        break;
      default:
    }
  } catch (error) {
    console.error('Error handling WebSocket message:', error);
  }
}

function broadcastToRoom(roomName, message) {
    if (rooms && rooms.has(roomName)) {
        const clients = rooms.get(roomName);
        const messageStr = JSON.stringify(message);
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                try { client.send(messageStr); }
                catch (sendError) { console.error('[WS Broadcast] Error sending message to client %s in room %s:', client.clientId || 'unknown', roomName, sendError.message); }
            }
        });
    }
}

function broadcastToAll(message) {
    const messageStr = JSON.stringify(message);
    if (wsServer) {
        wsServer.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) { client.send(messageStr); }
        });
    } else {
        console.error("[WS Broadcast] broadcastToAll called before wsServer was set!");
    }
}

function setupSocketHandlers() {
    if (!wsServer) {
        console.error("[Socket Handlers] setupSocketHandlers called without wsServer instance!");
        return;
    }

    eventBus.subscribe('chat:stream_started', (data) => {
        if (data && data.chatId && data.tempId && data.numericId) {
            broadcastToRoom(`chat:${data.chatId}`, { type: 'stream_started', payload: data });
        } else { console.error('[Socket EventBus Listener] Invalid chat:stream_started event data received:', data); }
    });

     eventBus.subscribe('chat:system_message', (data) => {
        if (data && data.chatId && data.content) {
            broadcastToRoom(`chat:${data.chatId}`, { type: 'system_message', payload: { content: data.content } });
         } else { console.error('[Socket EventBus Listener] Invalid chat:system_message event data received:', data); }
    });

    eventBus.subscribe('chat:message_created', (newMessage) => {
        if (newMessage && newMessage.chat_id && newMessage.id) {
            broadcastToRoom(`chat:${newMessage.chat_id}`, { type: 'new_message', payload: newMessage });
        } else {
            console.error('[Socket EventBus Listener] Invalid chat:message_created event data received:', newMessage);
        }
    });

    eventBus.subscribe('chat:title_updated', (data) => {
        if (data && data.chatId && data.newTitle) {
            broadcastToRoom(`chat:${data.chatId}`, { type: 'chat_title_updated', payload: { chatId: data.chatId, newTitle: data.newTitle } });
        } else {
            console.error('[Socket EventBus Listener] Invalid chat:title_updated event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_stream_started', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_started',
                payload: {
                    chatId: data.chatId,
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_stream_started event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_chunk_generated', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId && data.chunkType && data.payload) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_chunk',
                payload: {
                    chatId: data.chatId,
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                    chunkType: data.chunkType,
                    data: data.payload, 
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_chunk_generated event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_stream_complete', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_complete',
                payload: {
                    chatId: data.chatId,
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                    finalMessageId: data.finalMessageId, 
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_stream_complete event data received:', data);
        }
    });

    eventBus.subscribe('mcp:tool_stream_error', (data) => {
        if (data && data.chatId && data.toolName && data.toolExecutionId && data.error) {
            broadcastToRoom(`chat:${data.chatId}`, {
                type: 'tool_stream_error',
                payload: {
                    chatId: data.chatId,
                    toolName: data.toolName,
                    toolExecutionId: data.toolExecutionId,
                    error: data.error,
                }
            });
        } else {
            console.error('[Socket EventBus Listener] Invalid mcp:tool_stream_error event data received:', data);
        }
    });
}

/**
 * Authenticates an incoming MCP server connection request.
 */
async function authenticateMcpServer(request) {
    const parsedUrl = url.parse(request.url, true);
    const serverId = parsedUrl.query.serverId;
    const authHeader = request.headers['authorization'];

    if (!serverId || !authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('[WebSocket Auth] MCP connection rejected: Missing serverId query param or Authorization header.');
        return false;
    }
    const receivedKey = authHeader.split(' ')[1];
    if (!receivedKey) {
        console.warn('[WebSocket Auth] MCP connection rejected: Malformed Authorization header.');
        return false;
    }
    try {
        const server = await db.getAsync('SELECT api_key_hash, is_active, name FROM mcp_servers WHERE id = ?', [serverId]);
        if (!server) { console.warn('[WebSocket Auth] MCP connection rejected: Server ID %s not found.', serverId); return false; }
        if (!server.is_active) { console.warn('[WebSocket Auth] MCP connection rejected: Server %s (ID: %s) is not active.', server.name, serverId); return false; }
        if (!server.api_key_hash) { console.warn('[WebSocket Auth] MCP connection rejected: Server %s (ID: %s) has no API key configured.', server.name, serverId); return false; }
        const match = await bcrypt.compare(receivedKey, server.api_key_hash);
         if (!match) { console.warn('[WebSocket Auth] MCP connection rejected: Invalid API key for server %s (ID: %s).', server.name, serverId); return false; }
         return true;
     } catch (error) {
        console.error('[WebSocket Auth] Error during MCP server authentication for ID %s:', serverId, error);
        return false;
    }
}


/**
 * Initialize WebSocket server with the HTTP server
 */
function initializeSocket(server) {
  if (wsServer) return wsServer;

  wsServer = new WebSocket.Server({ noServer: true });

  // Handle HTTP server upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    const parsedUrl = url.parse(request.url, true);
    const pathname = parsedUrl.pathname;
    try {
        if (pathname === '/socket') { 
            wsServer.handleUpgrade(request, socket, head, (ws) => { wsServer.emit('connection', ws, request); });
        } else if (pathname === '/mcp-socket') { 
            const isAuthenticated = await authenticateMcpServer(request);
            if (isAuthenticated) {
                wsServer.handleUpgrade(request, socket, head, (ws) => {
                    ws.isMcpServer = true; ws.mcpServerId = parsedUrl.query.serverId;
                    wsServer.emit('connection', ws, request);
                });
            } else {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();
            }
        } else { socket.destroy(); }
    } catch (err) { console.error('[WebSocket] Error during upgrade handling:', err); socket.destroy(); }
  });

  // Set up connection handler
  wsServer.on('connection', (ws, req) => {
    const clientIdFromUrl = url.parse(req.url, true).query.clientId;

     if (ws.isMcpServer) {
     } else {
          ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
          if (clientIdFromUrl) { ws.clientId = clientIdFromUrl; /* ... handle reconnection ... */ }
         ws.send(JSON.stringify({ type: 'connection:established', payload: { message: 'WebSocket connection established', time: new Date().toISOString() } }));
    }

     // Common handlers
     ws.on('message', (message) => { handleWebSocketMessage(ws, message); }); 
     ws.on('close', () => {
     });
    ws.on('error', (error) => { console.error('[WebSocket] Connection error:', error); });
  });

  setupSocketHandlers();

  const heartbeatInterval = setInterval(() => {
    wsServer.clients.forEach((ws) => {
      if (ws.isMcpServer) return;
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false; ws.ping();
    });
  }, 30000);

  wsServer.on('close', () => clearInterval(heartbeatInterval));
 
   return wsServer;
 }

module.exports = {
  initializeSocket,
  get wsServer() { return wsServer; },
  broadcastToRoom,
  broadcastToAll,
  tokenProcessor,
  sendDownloadInfoToClient,
};
