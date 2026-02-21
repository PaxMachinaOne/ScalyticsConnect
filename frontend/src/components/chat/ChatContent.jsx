// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useRef, useEffect, useCallback, useMemo, useContext } from 'react';
import PropTypes from 'prop-types';
import { toast } from 'react-toastify';
import ModelLoadingContext from '../../contexts/ModelLoadingContext';
import socketService from '../../services/socketService';
import { websocketManager } from '../../services/websocketManager';
import ChatBubble from './ChatBubble';
import ChatScrollButton from './ChatScrollButton';
import fileService from '../../services/fileService';
import chatService from '../../services/chatService';
import apiService from '../../services/apiService'; 

const ChatContent = (props) => {
  const {
    chatId,
    chat,
    onSendMessage,
    sending = false,
    streamingMessages,
    currentNumericIdRef,
    model,
    userSettings,
    handleFeedbackUpdate,
    isOwner, 
    isModelAvailable, 
    isModelActive,
    isToolStreamingThisChat = false,
    isImageGenerationAvailable,
    reasoningSteps
  } = props;

  const [message, setMessage] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [inputError, setInputError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [performanceWarningAcknowledged, setPerformanceWarningAcknowledged] = useState(false); 
  const [isStoppingDeepSearch, setIsStoppingDeepSearch] = useState(false);
  const [activeInputTool, setActiveInputTool] = useState('chat'); 
  const [isDeepSearchEnabled, setIsDeepSearchEnabled] = useState(false);
  const [publicToolsLoading, setPublicToolsLoading] = useState(true);
  const [isImagePromptMode, setIsImagePromptMode] = useState(false);
  const { loadingModel } = useContext(ModelLoadingContext);

  useEffect(() => {
    if (!isToolStreamingThisChat && isStoppingDeepSearch) {
      setIsStoppingDeepSearch(false);
    }
  }, [isToolStreamingThisChat, isStoppingDeepSearch]);

  useEffect(() => {
    const fetchPublicToolStatus = async () => {
      setPublicToolsLoading(true);
      try {
        const response = await apiService.get('/mcp/public-tools/status');
        if (response.success && response.data) {
          setIsDeepSearchEnabled(!!response.data['deep-search']);
        } else {
          setIsDeepSearchEnabled(false);
        }
      } catch (error) {
        setIsDeepSearchEnabled(false);
      } finally {
        setPublicToolsLoading(false);
      }
    };
    fetchPublicToolStatus();
  }, []);

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, []);

  const handleSuggestionClicked = useCallback((suggestionText) => {
    setMessage(suggestionText);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = '0';
      const lineHeight = parseInt(getComputedStyle(textareaRef.current).lineHeight, 10) || 24;
      const maxLines = 10;
      const maxHeight = lineHeight * maxLines;
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.max(44, Math.min(scrollHeight, maxHeight)); 
      textareaRef.current.style.height = `${newHeight}px`;
    }
    setSuggestions([]); 
  }, [setMessage, textareaRef, setSuggestions]);

  const handleScroll = useCallback(() => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 200;
      setShowScrollButton(isScrolledUp);
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '0'; 
      const lineHeight = 24; 
      const maxLines = 10;
      const maxHeight = lineHeight * maxLines;
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.max(44, Math.min(scrollHeight, maxHeight));
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [message]);

  useEffect(() => {
    if (!showScrollButton) {
      scrollToBottom();
    }
  }, [chat?.messages, scrollToBottom, showScrollButton]);
  
  useEffect(() => {
    setPerformanceWarningAcknowledged(false); 
  }, [chatId]);

  useEffect(() => {
    const handlePerformanceWarning = (data) => {
      if (data && String(data.chatId) === String(chatId) && !performanceWarningAcknowledged) {
        const toastId = `perf-warn-${chatId}`; 
        toast.info(data.message || "Heads-up: Sending a large context history. Response generation might take a bit longer.", {
          toastId: toastId, position: "bottom-right", className: 'custom-toast', 
          bodyClassName: 'custom-toast-body', progressClassName: 'custom-toast-progress', 
          onClose: () => setPerformanceWarningAcknowledged(true), autoClose: 8000, 
          closeButton: false, hideProgressBar: true,
        });
      }
    };
    const unsubscribe = socketService.on('chat:performance_warning', handlePerformanceWarning);
    return () => unsubscribe();
  }, [chatId, performanceWarningAcknowledged]);

  useEffect(() => {
    const isStreaming = Object.keys(streamingMessages).length > 0;
    if (isStreaming && !showScrollButton) {
      scrollToBottom();
    }
  }, [streamingMessages, scrollToBottom, showScrollButton]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sending && activeInputTool === 'chat' && !isImagePromptMode) return; 
    if (activeInputTool === 'deep-search' && (sending || isToolStreamingThisChat || !isDeepSearchEnabled)) return;

    const trimmedMessage = message.trim();

    if (trimmedMessage === '/sum') {
      setInputError('');
      try {
        await apiService.post(`/chat/${chatId}/summarize`, {});
        setMessage('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      } catch (err) {
        toast.error(`Failed to summarize: ${err.response?.data?.message || err.message || 'Unknown error'}`, { position: "bottom-right" });
      }
      return;
    }

    if (activeInputTool === 'deep-search') {
      if (!isDeepSearchEnabled) { setInputError('Deep Search is currently disabled.'); return; }
      if (!trimmedMessage) { setInputError('Please enter a query for Deep Search.'); return; }
      setInputError('');
      try {
        const currentFileIds = uploadedFiles.map(file => file.id);
        const toolArgs = { query: trimmedMessage, ...(currentFileIds.length > 0 && { fileIds: currentFileIds }) };
        await apiService.post(`/chat/${chatId}/run-tool`, { toolName: 'deep-search', args: toolArgs });
        setMessage(''); setUploadedFiles([]); 
        if (textareaRef.current) textareaRef.current.style.height = 'auto'; 
      } catch (err) {
        setInputError(`Failed to start Deep Search: ${err.response?.data?.message || err.message || 'Unknown error'}`);
      }
    } else {
      const canSendImagePrompt = isImagePromptMode && isImageGenerationAvailable && trimmedMessage;
      const canSendTextPrompt = !isImagePromptMode && (trimmedMessage || uploadedFiles.length > 0);

      if (canSendImagePrompt || canSendTextPrompt) {
        setInputError('');
        if (chatId && websocketManager.isConnected) {
          websocketManager.subscribeToChat(chatId);
        }
        onSendMessage(trimmedMessage, isImagePromptMode ? [] : uploadedFiles, isImagePromptMode); 
        setMessage('');
        setUploadedFiles([]); 
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        scrollToBottom();
      } else if (isImagePromptMode && !isImageGenerationAvailable) {
        setInputError('Image Generation tool is not available or not configured in settings.');
      } else if (isImagePromptMode && !trimmedMessage) {
        setInputError('Please describe the image you want to generate.');
      } else if (!isImagePromptMode && !trimmedMessage && uploadedFiles.length === 0) {
         setInputError('Please enter a message or attach a file.');
      }
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setMessage(value);
    if (value.startsWith('/')) {
      const availableCommands = [{ command: '/sum', description: 'Summarize chat history' }];
      const typedCommand = value.substring(1).toLowerCase();
      const filteredSuggestions = availableCommands.filter(cmd => cmd.command.substring(1).startsWith(typedCommand));
      setSuggestions(filteredSuggestions);
      setActiveSuggestionIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setMessage(suggestion.command + ' '); 
    setSuggestions([]);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIndex(prev => (prev + 1) % suggestions.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIndex(prev => (prev - 1 + suggestions.length) % suggestions.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        if (suggestions[activeSuggestionIndex]) { e.preventDefault(); handleSuggestionClick(suggestions[activeSuggestionIndex]); }
        else if (e.key === 'Enter' && !e.shiftKey) { handleSubmit(e); }
      } else if (e.key === 'Escape') { setSuggestions([]); }
    } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (isImagePromptMode) {
      setInputError('File attachments are disabled in image generation mode.');
      e.target.value = null; return;
    }
    const allowedTypes = [
      'text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown',
      'text/html', 'application/javascript', 'text/css', 'application/pdf', 'text/x-python', 
      'application/x-python-code', 'text/jsx', 'text/typescript', 'text/tsx', 'text/x-c++src', 
      'text/x-csrc', 'text/x-java-source', 'application/xml', 'application/sql', 'application/x-sh'
    ];
    try {
      if (!allowedTypes.includes(file.type)) { setInputError(`Unsupported file type: ${file.type}`); return; }
      if (file.size > 50 * 1024 * 1024) { setInputError('File is too large. Maximum size is 50MB.'); return; }
      const uploadedFile = await fileService.uploadFile(file);
      setUploadedFiles(prev => [...prev, uploadedFile]);
      setInputError('');
    } catch (error) { setInputError(error.message || 'File upload failed'); }
    e.target.value = null; 
  };

  const handleFileRemove = (fileId) => setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  const triggerFileInput = () => {
    if (isImagePromptMode) {
      toast.info("File attachments are disabled in image generation mode.", { position: "bottom-right" });
      return;
    }
    fileInputRef.current.click();
  };

  const toggleDeepSearchMode = () => {
    if (isImagePromptMode) { 
      toast.info("Disable image generation mode to use Deep Search.", { position: "bottom-right" });
      return;
    }
    if (!isDeepSearchEnabled && activeInputTool === 'chat') {
      toast.warn("Deep Search is currently disabled by the administrator.", { position: "bottom-right" });
      return;
    }
    setActiveInputTool(prev => prev === 'deep-search' ? 'chat' : 'deep-search');
    textareaRef.current?.focus();
  };
  
  const toggleImagePromptMode = () => {
    if (!isImageGenerationAvailable) {
      toast.warn("Image Generation tool is not available or not configured.", { position: "bottom-right" });
      return;
    }
    if (activeInputTool === 'deep-search') {
      toast.info("Disable Deep Search mode to use Image Generation.", { position: "bottom-right" });
      return;
    }
    setIsImagePromptMode(prev => !prev);
    textareaRef.current?.focus();
  };

  useEffect(() => {
    if (!isImageGenerationAvailable || activeInputTool === 'deep-search') {
      setIsImagePromptMode(false);
    }
  }, [isImageGenerationAvailable, activeInputTool]);

  return (
    <div className="flex flex-col h-full relative">
      <div
        ref={chatContainerRef}
        className="flex-1 flex flex-col items-center overflow-y-auto py-4 px-3 md:px-6 w-full max-h-[calc(100vh-305px)] overflow-x-hidden bg-gray-50 dark:bg-dark-primary scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent"
        onScroll={handleScroll}
        style={{ paddingBottom: "15px" }}
      >
        <div className="w-full max-w-4xl mx-auto chat-container mb-[15px]">
          {useMemo(() => {
            const displayNotice = userSettings?.display_summarization_notice === undefined ? true : Boolean(userSettings.display_summarization_notice);
            const messagesToDisplay = chat?.messages?.filter(msg => {
              if (!displayNotice && msg.role === 'system' && msg.content?.startsWith('Summary of earlier conversation:')) return false;
              return true;
            }) || [];
            if (messagesToDisplay.length === 0 && !sending && Object.keys(streamingMessages).length === 0) {
                return (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-center p-4">
                        <div className="bg-white dark:bg-dark-primary rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700 max-w-md">
                        <svg className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-secondary mb-2">No messages yet</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Get started by sending your first message.</p>
                        </div>
                    </div>
                );
            }
            return messagesToDisplay.map((msg) => (
              <ChatBubble key={msg.id} message={msg} isLoading={!!msg.isLoading} streamingContent={streamingMessages[msg.id] || null} handleFeedbackUpdate={handleFeedbackUpdate} onSuggestionClick={handleSuggestionClicked} reasoningSteps={reasoningSteps} />
            ));
          }, [chat?.messages, userSettings?.display_summarization_notice, streamingMessages, handleFeedbackUpdate, handleSuggestionClicked, sending, reasoningSteps])}
        </div>
      </div>
      <ChatScrollButton show={showScrollButton} onClick={scrollToBottom} />
      <div className="text-center text-xs text-gray-500 dark:text-gray-400 mb-8 px-4">AI models can make mistakes. Please verify important information.</div>
      
      {isOwner && isModelAvailable ? (
        <div className="absolute bottom-[10px] left-0 right-0 px-4 py-3 bg-white dark:bg-dark-primary border-t border-gray-100 dark:border-gray-800 shadow-md z-10">
          <form onSubmit={handleSubmit} className="relative">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".csv,.json,.txt,.pdf,.md,.jpg,.jpeg,.png,.gif,.bmp,.zip,.docx,.xlsx,.pptx,.mp4,.avi,.mov,.py,.js,.html,.css,.jsx,.ts,.tsx,.cpp,.c,.java,.php,.rb,.swift,.go,.rs,.xml,.sql,.sh,.bat,.ipynb" />
            {uploadedFiles.length > 0 && !isImagePromptMode && (
              <div className="mb-2 flex space-x-2 overflow-x-auto pb-2 chat-container mx-auto">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="flex items-center bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-md px-2 py-1 text-sm">
                    <span className="mr-2 text-lg">{chatService.getFileIcon(file.file_type || file.type)}</span>
                    <span className="mr-2">{file.original_name}</span>
                    <button type="button" onClick={() => handleFileRemove(file.id)} className="text-red-500 hover:text-red-700">
                      <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {inputError && <div className="text-red-500 dark:text-red-400 text-xs mb-2">{inputError}</div>}
            
            {(activeInputTool === 'deep-search' && isDeepSearchEnabled) && !isImagePromptMode && (
              <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium px-2 py-0.5 rounded-full shadow">Deep Search Active</div>
            )}
             {isImagePromptMode && isImageGenerationAvailable && (
              <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs font-medium px-2 py-0.5 rounded-full shadow">Image Generation Active</div>
            )}

            {suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 max-w-2xl mx-auto bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-20 max-h-40 overflow-y-auto">
                 {suggestions.map((suggestion, index) => (
                    <li
                      key={suggestion.command}
                      className={`px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 ${index === activeSuggestionIndex ? 'bg-gray-100 dark:bg-gray-600' : ''}`}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <span className="font-medium text-gray-800 dark:text-gray-200">{suggestion.command}</span>
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{suggestion.description}</span>
                    </li>
                  ))}
              </div>
            )}
            <div className={`flex flex-col max-w-2xl mx-auto w-full rounded-lg border ${activeInputTool === 'deep-search' && !isImagePromptMode && isDeepSearchEnabled ? 'border-blue-500 ring-1 ring-blue-500' : (isImagePromptMode && isImageGenerationAvailable ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300 dark:border-gray-600')} bg-white dark:bg-dark-primary shadow-sm focus-within:ring-1 ${isImagePromptMode && isImageGenerationAvailable ? 'focus-within:ring-purple-500 focus-within:border-purple-500' : 'focus-within:ring-blue-500 focus-within:border-blue-500'} transition-all p-2`}>
              <textarea
                ref={textareaRef} value={message} onChange={handleChange} onKeyDown={handleKeyDown}
                className={`block w-full resize-none border-0 bg-transparent py-1.5 px-1 text-sm md:text-base text-gray-900 dark:text-dark-text-secondary placeholder-gray-500 dark:placeholder-dark-text-secondary focus:outline-none focus:ring-0 min-h-[24px] ${!isModelActive || (activeInputTool === 'deep-search' && !isDeepSearchEnabled && !isImagePromptMode) ? 'cursor-not-allowed' : ''}`}
                rows="1" readOnly={!isModelActive || (activeInputTool === 'deep-search' && !isDeepSearchEnabled && !isImagePromptMode)}
                style={{ maxHeight: "240px", overflowY: message && textareaRef.current && textareaRef.current.scrollHeight > 240 ? "auto" : "hidden", lineHeight: "24px" }}
                disabled={loadingModel || (sending && activeInputTool === 'chat' && !isImagePromptMode) || (activeInputTool === 'deep-search' && (!isDeepSearchEnabled || isToolStreamingThisChat))}
                placeholder={
                  loadingModel ? "A new model is being loaded, please wait..." :
                  !isModelActive ? "Model is inactive" :
                  activeInputTool === 'deep-search' && !isImagePromptMode ? (isDeepSearchEnabled ? "Enter Deep Search query..." : "Deep Search disabled") :
                  isImagePromptMode ? (isImageGenerationAvailable ? "Describe the image you want to generate..." : "Image Generation not available/configured") :
                  "Message Scalytics Copilot..."
                }
              />
              <div className="flex items-center justify-between space-x-1 mt-1.5 h-9">
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={toggleImagePromptMode}
                    disabled={sending || !isModelActive || !isImageGenerationAvailable || activeInputTool === 'deep-search'} 
                    className={`p-1.5 rounded-full focus:outline-none transition-colors ${
                      isImagePromptMode && isImageGenerationAvailable
                        ? 'bg-purple-100 dark:bg-purple-800 text-purple-600 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-700'
                        : (sending || !isModelActive || !isImageGenerationAvailable || activeInputTool === 'deep-search')
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50'
                          : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title={
                      !isImageGenerationAvailable ? "Image Generation tool not available or not configured" :
                      activeInputTool === 'deep-search' ? "Disable Deep Search to use Image Generation" :
                      isImagePromptMode ? "Switch to Text Prompt Mode" : 
                      "Switch to Image Generation Mode"
                    }
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button type="button" onClick={toggleDeepSearchMode} disabled={sending || publicToolsLoading || isImagePromptMode}
                    className={`p-1.5 rounded-full focus:outline-none transition-colors ${activeInputTool === 'deep-search' && isDeepSearchEnabled && !isImagePromptMode ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-700' : (sending || !isDeepSearchEnabled || publicToolsLoading || isImagePromptMode) ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    title={publicToolsLoading ? "Loading tools..." : isImagePromptMode ? "Deep Search disabled in image mode" : (!isDeepSearchEnabled ? "Deep Search disabled by admin" : (activeInputTool === 'deep-search' ? "Switch to Standard Chat" : "Activate Deep Search"))}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </button>
                  <button type="button" onClick={triggerFileInput} disabled={sending || !isModelActive || isImagePromptMode}
                    className={`p-1.5 rounded-full ${(sending || !isModelActive || isImagePromptMode) ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'} focus:outline-none transition-colors`}
                    title={!isModelActive ? "Model is inactive" : (isImagePromptMode ? "File attachment disabled in image mode" : "Attach a file")}>
                    <svg className="h-5 w-5" viewBox="-2.5 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#6B7280" transform="matrix(1, 0, 0, -1, 0, 0)">
                       <g id="SVGRepo_bgCarrier" strokeWidth="0"></g>
                       <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round"></g>
                       <g id="SVGRepo_iconCarrier"> <g id="icomoon-ignore"> </g> <path d="M2.098 5.903c1.309-1.309 3.050-2.030 4.902-2.030v0c1.852 0 3.593 0.721 4.902 2.030l14.035 14.036c1.87 1.87 1.87 4.913 0 6.783-0.906 0.907-2.11 1.405-3.392 1.405s-2.486-0.499-3.392-1.405l-6.197-6.196 0.005-0.005-7.407-7.408c-0.503-0.502-0.78-1.171-0.78-1.881 0-0.711 0.277-1.379 0.78-1.882 0.502-0.502 1.17-0.78 1.881-0.78s1.379 0.278 1.881 0.78l11.871 11.87-0.742 0.742-11.871-11.87c-0.609-0.608-1.67-0.608-2.278 0-0.304 0.304-0.472 0.709-0.472 1.14s0.168 0.835 0.472 1.139l13.598 13.609c0.708 0.709 1.648 1.098 2.65 1.098s1.942-0.389 2.65-1.098c1.461-1.461 1.461-3.839 0-5.3l-14.035-14.036c-1.112-1.111-2.589-1.723-4.16-1.723s-3.049 0.612-4.16 1.723c-1.31-1.31-2.031-3.051-2.031-4.903s0.721-3.593 2.031-4.902z"> </path> </g>
                    </svg>
                  </button>
                </div>
                <div className="flex items-center">
                  {(sending || (activeInputTool === 'deep-search' && isToolStreamingThisChat)) ? (
                     (activeInputTool === 'deep-search' && isToolStreamingThisChat) ? (
                      <button type="button" onClick={() => { if (chatId && websocketManager.isConnected) { setIsStoppingDeepSearch(true); websocketManager.send('stop_deep_search', { requestId: chatId }); }}} disabled={isStoppingDeepSearch}
                        className={`p-1.5 rounded-full focus:outline-none transition-colors ${isStoppingDeepSearch ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-400'}`}
                        title={isStoppingDeepSearch ? "Stopping Deep Search..." : "Stop Deep Search"}>
                        {isStoppingDeepSearch ? <svg className="animate-spin h-5 w-5 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/><rect x="8" y="8" width="8" height="8" fill="currentColor"/></svg>}
                      </button>
                    ) : (!model?.external_provider_id && activeInputTool === 'chat' && sending && !isImagePromptMode) ? ( 
                      <button type="button" onClick={() => { const numericRequestId = currentNumericIdRef.current; if (numericRequestId && websocketManager.isConnected) { websocketManager.send('stop_generation', { requestId: numericRequestId }); }}}
                        className="p-1.5 rounded-full text-red-600 hover:text-red-800 dark:text-red-500 dark:hover:text-red-400 focus:outline-none transition-colors" title="Stop generation">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/><rect x="8" y="8" width="8" height="8" fill="currentColor"/></svg>
                      </button>
                    ) : ( 
                      <button type="button" disabled={true} className="p-1.5 rounded-full text-gray-300 dark:text-gray-400 cursor-not-allowed" title={activeInputTool === 'deep-search' ? "Deep Search Running..." : "Generating..."}>
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      </button>
                    )
                  ) : (
                    <button type="submit"
                      disabled={!isModelActive || 
                                (activeInputTool === 'deep-search' && (!message.trim() || !isDeepSearchEnabled)) || 
                                (activeInputTool === 'chat' && !isImagePromptMode && !message.trim() && uploadedFiles.length === 0) ||
                                (activeInputTool === 'chat' && isImagePromptMode && (!isImageGenerationAvailable || !message.trim())) 
                               }
                      className={`p-1.5 rounded-full ${(!isModelActive || 
                                (activeInputTool === 'deep-search' && (!message.trim() || !isDeepSearchEnabled)) || 
                                (activeInputTool === 'chat' && !isImagePromptMode && !message.trim() && uploadedFiles.length === 0) ||
                                (activeInputTool === 'chat' && isImagePromptMode && (!isImageGenerationAvailable || !message.trim()))
                                ) ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50' : 'text-blue-600 hover:text-blue-800 dark:text-blue-500 dark:hover:text-blue-400'} focus:outline-none transition-colors`}
                      title={!isModelActive ? "Model is inactive" : (activeInputTool === 'deep-search' ? (isDeepSearchEnabled ? "Run Deep Search" : "Deep Search disabled by admin") : (isImagePromptMode ? (isImageGenerationAvailable ? "Generate Image" : "Image Generation tool not available or not configured") : "Send message"))}>
                      <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24"><path d="M13 5.41V21a1 1 0 0 1-2 0V5.41l-5.3 5.3a1 1 0 1 1-1.4-1.42l7-7a1 1 0 0 1 1.4 0l7 7a1 1 0 1 1-1.4 1.42L13 5.4z"/></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className="absolute bottom-[10px] left-0 right-0 px-4 py-3 bg-gray-100 dark:bg-dark-primary border-t border-gray-200 dark:border-gray-700 z-10">
          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            {!isOwner ? "You have read-only access to this shared chat." : !isModelAvailable ? "The model for this chat is unavailable." : !isModelActive ? "This model is currently inactive. Activate it in settings to send messages." : ""}
          </div>
        </div>
      )}
    </div>
  );
};

ChatContent.propTypes = {
  chatId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  chat: PropTypes.object.isRequired,
  onSendMessage: PropTypes.func.isRequired,
  sending: PropTypes.bool,
  onChatUpdated: PropTypes.func,
  handleStreamingComplete: PropTypes.func,
  streamingMessages: PropTypes.object,
  currentNumericIdRef: PropTypes.object,
  model: PropTypes.shape({ 
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    is_active: PropTypes.bool,
    can_generate_images: PropTypes.bool, 
    external_provider_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
  userSettings: PropTypes.object,
  handleFeedbackUpdate: PropTypes.func,
  isOwner: PropTypes.bool.isRequired,
  isModelAvailable: PropTypes.bool.isRequired, 
  isModelActive: PropTypes.bool.isRequired,
  isToolStreamingThisChat: PropTypes.bool,
  isImageGenerationAvailable: PropTypes.bool, 
};

export default ChatContent;
