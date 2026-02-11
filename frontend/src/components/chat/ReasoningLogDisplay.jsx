// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React from 'react';
import PropTypes from 'prop-types';

const ReasoningLogDisplay = ({ steps }) => {
  if (!steps || steps.length === 0) {
    return null;
  }

  // Split steps into reasoning and completion sections
  const completionStepTypes = ['evidence_evaluation', 'content_analysis', 'source_diversity', 'synthesis_complete'];
  const reasoningSteps = steps.filter(step => !completionStepTypes.includes(step.step_message));
  const completionSteps = steps.filter(step => completionStepTypes.includes(step.step_message));

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-3">
        <div className="flex items-center mb-3">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 mr-2">Deep Search Process</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">({steps.length} {steps.length === 1 ? 'step' : 'steps'})</span>
        </div>
        
        {/* Reasoning Steps Section */}
        {reasoningSteps.length > 0 && (
          <div className="space-y-1 mb-4">
            {reasoningSteps.map((step, index) => (
              <div key={step.id} className="flex items-start space-x-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0 mt-1.5"></div>
                <div className="flex-1">
                  <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                    {step.explanation_message}
                  </div>
                  {step.error_message && (
                    <div className="mt-1 text-xs text-red-500 dark:text-red-400">
                      {step.error_message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Task Finished Separator and Statistics Section */}
        {completionSteps.length > 0 && (
          <>
            <div className="mb-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Task finished</div>
              <div className="border-t border-gray-300 dark:border-gray-600 mb-2"></div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Statistics</div>
            </div>
            
            <div className="space-y-1">
              {completionSteps.map((step, index) => (
                <div key={step.id} className="flex items-start space-x-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0 mt-1.5"></div>
                  <div className="flex-1">
                    <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                      {step.explanation_message}
                    </div>
                    {step.error_message && (
                      <div className="mt-1 text-xs text-red-500 dark:text-red-400">
                        {step.error_message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

ReasoningLogDisplay.propTypes = {
  steps: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    explanation_message: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    created_at: PropTypes.string.isRequired,
    error_message: PropTypes.string,
  })).isRequired,
};

export default ReasoningLogDisplay;
