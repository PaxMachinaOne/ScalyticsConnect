import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import eventBus from '../../../utils/eventBus';

const ModelProgressPanel = ({ token, onClose }) => {
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('Initiating model activation...');
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    setStartTime(Date.now());
    
    const timer = setInterval(() => {
      if (!isComplete && !hasError) {
        setElapsedTime(Date.now() - startTime);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime, isComplete, hasError]);

  const handleActivationStart = useCallback((activationId, data) => {
    if (activationId !== token) return;
    setCurrentMessage(data.message || 'Model activation started...');
  }, [token]);

  const handleActivationComplete = useCallback((activationId, data) => {
    if (activationId !== token) return;
    setCurrentMessage(data.message || 'Model ready for inference!');
    setIsComplete(true);
  }, [token]);

  const handleActivationError = useCallback((activationId, data) => {
    if (activationId !== token) return;
    setHasError(true);
    
    const errorMessage = data.error || 'Unknown error';
    let displayError = errorMessage;
    
    if (errorMessage.includes('CUDA out of memory')) {
      displayError = 'GPU memory insufficient for this model';
    } else if (errorMessage.includes('No available ports')) {
      displayError = 'No available ports for model server';
    } else if (errorMessage.includes('Model file') && errorMessage.includes('not found')) {
      displayError = 'Model files not found or corrupted';
    } else if (errorMessage.includes('VRAM')) {
      displayError = 'Insufficient VRAM for model requirements';
    }
    
    setCurrentMessage(`Error: ${displayError}`);
    setShowDebugLogs(true);
  }, [token]);

  const handleActivationDebug = useCallback((activationId, data) => {
    if (activationId !== token) return;
    if (data.log) {
      const logLine = data.log;
      if (logLine.includes('Loading safetensors checkpoint shards:') && logLine.includes('%')) {
        const match = logLine.match(/(\d+)%/);
        if (match) {
          setCurrentMessage(`Loading model weights: ${match[1]}%`);
        }
      } else if (logLine.includes('Loading weights took')) {
        setCurrentMessage('Weights loaded, initializing engine...');
      } else if (logLine.includes('init engine') && logLine.includes('took')) {
        setCurrentMessage('Engine initialized, starting server...');
      } else if (logLine.includes('Application startup complete')) {
        setCurrentMessage('Server started, model ready!');
      }
      
      setLogs(prev => [...prev.slice(-20), logLine]);
    }
  }, [token]);

  useEffect(() => {
    const subscriptions = [
      eventBus.subscribe('activation:start', handleActivationStart),
      eventBus.subscribe('activation:complete', handleActivationComplete), 
      eventBus.subscribe('activation:error', handleActivationError),
      eventBus.subscribe('activation:debug', handleActivationDebug)
    ];

    return () => {
      subscriptions.forEach(unsubscribe => unsubscribe());
    };
  }, [handleActivationStart, handleActivationComplete, handleActivationError, handleActivationDebug]);

  const formatTime = (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  return (
    <div className="mb-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {isComplete ? 'Model Ready' : hasError ? 'Activation Failed' : currentMessage}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(elapsedTime)}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {logs.length > 0 && (
            <button
              onClick={() => setShowDebugLogs(!showDebugLogs)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              title="Toggle logs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {!isComplete && !hasError && (
        <div className="px-4 pb-3">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
            <div className="bg-blue-500 h-1 rounded-full transition-all duration-500 animate-pulse"></div>
          </div>
        </div>
      )}

      {showDebugLogs && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3">
            <div className="bg-gray-900 text-gray-300 font-mono text-xs p-3 rounded max-h-48 overflow-y-auto">
              {logs.length === 0 ? (
                <div className="text-gray-500">No logs available</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

ModelProgressPanel.propTypes = {
  onClose: PropTypes.func
};

export default ModelProgressPanel;
