// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import adminService from '../../../services/admin';
import SimpleAlert from '../../common/SimpleAlert';

const GlobalPrivacyTab = ({ onSettingChange }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [globalPrivacyEnabled, setGlobalPrivacyEnabled] = useState(false);
  const [processingToggle, setProcessingToggle] = useState(false);

  // Fetch current privacy settings
  const fetchPrivacySettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await adminService.getPrivacySettings();
      let privacyMode = false; 
      if (response?.data?.data?.globalPrivacyMode !== undefined) {
        privacyMode = response.data.data.globalPrivacyMode;
      } else if (response?.data?.globalPrivacyMode !== undefined) {
        privacyMode = response.data.globalPrivacyMode;
      } else if (response?.globalPrivacyMode !== undefined) {
         privacyMode = response.globalPrivacyMode;
      }
      setGlobalPrivacyEnabled(Boolean(privacyMode));
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load global privacy settings.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrivacySettings();
  }, [fetchPrivacySettings]);

  const handleToggleGlobalPrivacy = async () => {
    const newState = !globalPrivacyEnabled;
    setProcessingToggle(true);
    setError(null);
    setSuccess(null);
    const originalState = globalPrivacyEnabled;

    try {
      const response = await adminService.updateGlobalPrivacyMode({ enabled: newState });
      
      const success = (
        (response?.data?.data?.success) || 
        (response?.data?.success) || 
        (response?.success) ||
        (response?.globalPrivacyMode !== undefined) ||
        (response?.data?.globalPrivacyMode !== undefined) ||
        (response?.data?.data?.globalPrivacyMode !== undefined)
      );
      
      if (success) {
        setGlobalPrivacyEnabled(newState);
        const successMsg = `Global privacy mode ${newState ? 'enabled' : 'disabled'} successfully.`;
        setSuccess(successMsg);
        
        if (onSettingChange) {
          onSettingChange();
        }
        
      } else {
        const errorMessage = 
          response?.data?.data?.message || 
          response?.data?.message || 
          response?.message || 
          'Failed to update setting';
        throw new Error(errorMessage);
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Error toggling privacy mode.';
      setError(errorMsg);
      setGlobalPrivacyEnabled(originalState); 
    } finally {
      setProcessingToggle(false);
    }
  };

  if (loading) {
     return (
        <div className="flex justify-center items-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        </div>
      );
  }

  return (
    <div>
      {/* Display Error/Success Messages */}
      <SimpleAlert message={error} type="error" onClose={() => setError(null)} />
      <SimpleAlert message={success} type="success" onClose={() => setSuccess(null)} />

      {/* Global Privacy Mode Toggle Section */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-dark-border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Global Privacy Mode</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              When enabled, external LLM providers (e.g., OpenAI, Anthropic) and Hugging Face API will be disabled. Search providers and local models remain active.<br/>
              No data is sent to the disabled external API providers.
            </p>
          </div>
          <div className="flex items-center">
             {/* Standard Button Toggle */}
             <button
                onClick={handleToggleGlobalPrivacy}
                disabled={processingToggle}
                className={`px-5 py-2.5 rounded font-medium text-white text-sm transition-colors duration-150 ${
                  globalPrivacyEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                } ${processingToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
                id="global-privacy-toggle-button"
              >
                {processingToggle ? 'Processing...' : (globalPrivacyEnabled ? 'Disable Privacy Mode' : 'Enable Privacy Mode')}
              </button>
          </div>
        </div>

        {/* Status Card */}
         <div className={`mt-4 p-4 border rounded-lg ${globalPrivacyEnabled ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900' : 'bg-gray-50 dark:bg-dark-primary/20 border-gray-200 dark:border-dark-border'}`}>
           <div className="flex items-start">
             <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${globalPrivacyEnabled ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-dark-primary'}`}>
               <svg className={`h-6 w-6 ${globalPrivacyEnabled ? 'text-blue-600 dark:text-dark-link' : 'text-gray-600 dark:text-gray-400'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
               </svg>
             </div>
             <div className="ml-4">
               <h4 className={`text-md font-medium ${globalPrivacyEnabled ? 'text-blue-800 dark:text-dark-text-primary' : 'text-gray-800 dark:text-gray-300'}`}>
                 {globalPrivacyEnabled ? 'Privacy Mode Enabled' : 'Privacy Mode Disabled'}
               </h4>
               <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                 {globalPrivacyEnabled
                   ? 'External LLM and Hugging Face API providers are disabled. Search providers and local models remain accessible.'
                   : 'External API providers and models can be used if configured and enabled. Disabling Privacy Mode will reactivate all external providers and their associated models, regardless of their previous state.'}
               </p>
             </div>
           </div>
         </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
         <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow">
           <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">What is Privacy Mode?</h3>
           <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
             <p>Privacy Mode is a system-wide setting that restricts the application to use primarily local models and trusted search providers. When enabled:</p>
             <ul className="list-disc pl-5 mt-2 space-y-1">
               <li>External LLM providers (OpenAI, Anthropic, etc.) and the Hugging Face API will be disabled.</li>
               <li>Search providers (e.g., Google Search, Bing) remain active for features like Deep Search.</li>
               <li>Users will primarily see and use locally hosted models, alongside available search functionalities.</li>
               <li>No data will be sent to the disabled external LLM or Hugging Face API providers.</li>
               <li>This overrides individual user settings and permissions regarding model access.</li>
             </ul>
           </div>
         </div>
         <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow">
           <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Security Considerations</h3>
           <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
             <p>Privacy Mode enhances security in these ways:</p>
             <ul className="list-disc pl-5 mt-2 space-y-1">
               <li>Ensures compliance with strict data protection requirements.</li>
               <li>Prevents sensitive information from being shared with third parties.</li>
               <li>Creates a fully controlled AI environment when needed.</li>
               <li>Provides protection from potential API-based vulnerabilities from external services.</li>
             </ul>
           </div>
         </div>
       </div>
    </div>
  );
};

export default GlobalPrivacyTab;
