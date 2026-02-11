// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState } from 'react';

const KeySummaryDisplay = ({ summaries, isActive = false }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!summaries || summaries.length === 0) {
    return null;
  }

  // Calculate step counts inline to avoid hooks issues
  const completedSteps = summaries.filter((_, index) => index < summaries.length - 1).length;
  const runningSteps = isActive && summaries.length > 0 ? 1 : 0;

  const StatusIndicator = ({ isCompleted, isRunning }) => {
    if (isCompleted) {
      return (
        <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0 mr-2" 
             title="Completed">
        </div>
      );
    } else if (isRunning) {
      return (
        <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0 mr-2 animate-pulse" 
             title="Running">
        </div>
      );
    }
    return (
      <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600 flex-shrink-0 mr-2" 
           title="Pending">
      </div>
    );
  };

  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleExpansion}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
      >
        <div className="flex items-center space-x-3">
          {isExpanded ? (
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Deep Search Reasoning
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({completedSteps}/{summaries.length} steps)
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          {runningSteps > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
              <span className="text-xs text-orange-600 dark:text-orange-400">
                {isActive ? 'Processing...' : 'Active'}
              </span>
            </div>
          )}
          {runningSteps === 0 && completedSteps === summaries.length && summaries.length > 0 && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs text-green-600 dark:text-green-400">
                Complete
              </span>
            </div>
          )}
        </div>
      </button>

      {/* Steps Content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-3 max-h-96 overflow-y-auto">
          {summaries.map((summary, index) => {
            const isCompleted = index < summaries.length - 1 || !isActive;
            const isRunning = index === summaries.length - 1 && isActive;
            
            return (
              <div key={index} className="flex items-start space-x-3">
                <StatusIndicator isCompleted={isCompleted} isRunning={isRunning} />
                
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {summary.message}
                  </div>
                  
                  {/* Timestamps */}
                  {summary.timestamp && (
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {new Date(summary.timestamp).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Show loading indicator if no steps yet but panel is active */}
          {summaries.length === 0 && isActive && (
            <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
              <span className="text-sm">Initializing reasoning...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KeySummaryDisplay;
