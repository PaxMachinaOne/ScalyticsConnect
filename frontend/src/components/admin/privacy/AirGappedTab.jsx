// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../../services/apiService';
import SimpleAlert from '../../common/SimpleAlert';

const AirGappedTab = ({ onSettingChange }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isAirGapped, setIsAirGapped] = useState(false);
  const [processingToggle, setProcessingToggle] = useState(false);
  
  // Fetch current air-gapped setting
  const fetchAirGappedStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiService.get('/admin/settings/air_gapped');
      
      // More flexible response parsing
      let airGappedMode = false;
      if (response?.data?.data?.airGapped !== undefined) {
        airGappedMode = Boolean(response.data.data.airGapped);
      } else if (response?.data?.airGapped !== undefined) {
        airGappedMode = Boolean(response.data.airGapped);
      } else if (response?.airGapped !== undefined) {
        airGappedMode = Boolean(response.airGapped);
      }
      
      setIsAirGapped(airGappedMode);
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load air-gapped setting.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAirGappedStatus();
  }, [fetchAirGappedStatus]);

  // Handle toggle change
  const handleToggleAirGapped = async () => {
    const newState = !isAirGapped;
    setProcessingToggle(true);
    setError(null);
    setSuccess(null);
    const originalState = isAirGapped;

    try {
      const response = await apiService.put('/admin/settings/air_gapped', { airGapped: newState });
      
      const success = (
        (response?.data?.data?.success) || 
        (response?.data?.success) || 
        (response?.success) ||
        (response?.airGapped !== undefined) ||
        (response?.data?.airGapped !== undefined) ||
        (response?.data?.data?.airGapped !== undefined)
      );
      
      if (success) {
        setIsAirGapped(newState);
        const successMsg = `Air-gapped mode ${newState ? 'enabled' : 'disabled'} successfully.`;
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
      const errorMsg = `Error toggling air-gapped mode: ${err.response?.data?.message || err.message}.`;
      setError(errorMsg);
      setIsAirGapped(originalState); 
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
    <div className="bg-white dark:bg-dark-primary shadow rounded-lg p-6 border border-gray-200 dark:border-dark-border">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary mb-4">Air-Gapped Mode</h2>
      
      {/* Display Error/Success Messages */}
      <SimpleAlert message={error} type="error" onClose={() => setError(null)} />
      <SimpleAlert message={success} type="success" onClose={() => setSuccess(null)} />

      {/* Air-Gapped Mode Toggle Section */}
      <div className="mb-8 p-4 border border-gray-200 dark:border-dark-border rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Air-Gapped Mode</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Prevents <strong>all</strong> external connections, including Hugging Face API, external LLM providers, and search providers.<br/> 
              Only locally hosted models will function. Enabling this creates a fully isolated environment and automatically enables Global Privacy Mode.
            </p>
          </div>
          <div className="flex items-center">
             {/* Standard Button Toggle */}
             <button
                onClick={handleToggleAirGapped}
                disabled={processingToggle}
                className={`px-5 py-2.5 rounded font-medium text-white text-sm transition-colors duration-150 ${
                  isAirGapped ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                } ${processingToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
                id="air-gapped-toggle-button"
              >
                {processingToggle ? 'Processing...' : (isAirGapped ? 'Disable Air-Gap' : 'Enable Air-Gap')}
              </button>
          </div>
        </div>

        {/* Status Card */}
         <div className={`mt-4 p-4 border rounded-lg ${isAirGapped ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900' : 'bg-gray-50 dark:bg-dark-primary/20 border-gray-200 dark:border-dark-border'}`}>
           <div className="flex items-start">
             <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${isAirGapped ? 'bg-yellow-100 dark:bg-yellow-800' : 'bg-gray-100 dark:bg-dark-primary'}`}>
               <svg className={`h-6 w-6 ${isAirGapped ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
               </svg>
             </div>
             <div className="ml-4">
               <h4 className={`text-md font-medium ${isAirGapped ? 'text-yellow-800 dark:text-yellow-300' : 'text-gray-800 dark:text-gray-300'}`}>
                 {isAirGapped ? 'Air-Gapped Mode Enabled' : 'Air-Gapped Mode Disabled'}
               </h4>
               <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                 {isAirGapped ? 'All external connections (including search and Hugging Face API) are blocked. Only local models are accessible.' : 'System may connect to external services like Hugging Face Hub, LLM providers, and search APIs.'}
               </p>
             </div>
           </div>
         </div>
      </div>

      {/* Information Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
         <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow">
           <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">What is Air-Gapped Mode?</h3>
           <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
             <p>Air-Gapped Mode completely isolates the application from the internet by blocking all outbound network requests. Only locally hosted models will function.</p>
             <ul className="list-disc pl-5 mt-2 space-y-1">
               <li><strong>Hugging Face API:</strong> Disables all API interactions, model searches, and downloads.</li>
               <li><strong>External LLM Providers:</strong> Blocks connections to all external AI APIs (OpenAI, Anthropic, etc.).</li>
               <li><strong>Search Providers:</strong> Disables connections to all external search providers (Google, Bing, etc.).</li>
               <li><strong>Updates:</strong> Prevents automatic downloads of any external resources.</li>
               <li><strong>Security:</strong> Creates a truly isolated environment for high-security deployments.</li>
               <li><strong>Preparation:</strong> Requires all necessary files to be pre-downloaded before enabling</li>
             </ul>
           </div>
         </div>
         <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg shadow">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">How it Works</h3>
             <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                <p>Air-Gapped Mode has important relationships with other system settings:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li><strong>Hierarchy:</strong> Air-Gapped Mode is higher in the security hierarchy than Privacy Mode</li>
                    <li><strong>Dependencies:</strong> Enabling Air-Gapped automatically enables Privacy Mode (since external models cannot function)</li>
                    <li><strong>Restrictions:</strong> Air-Gapped prevents HuggingFace model searches and downloads</li>
                    <li><strong>Fallbacks:</strong> All models that depend on external resources will attempt to use local-only fallbacks</li>
                    <li><strong>Consistency:</strong> Disabling Privacy Mode will automatically disable Air-Gapped Mode</li>
                </ul>
             </div>
         </div>
       </div>
    </div>
  );
};

export default AirGappedTab;
