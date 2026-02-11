// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import adminService from '../../../services/adminService';

const GroupModelAccess = ({ groupId, groupName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modelAccess, setModelAccess] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchGroupModelAccess = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await adminService.getGroupModelAccess(groupId);
      let modelAccessData = {};
      
      const responseData = response?.data || response;
      
      if (typeof responseData === 'object' && responseData !== null) {
        if (responseData.data && typeof responseData.data === 'object') {
          modelAccessData = responseData.data;
        } else {
          const metaProps = ['success', 'message', 'timestamp', 'status'];
          modelAccessData = Object.fromEntries(
            Object.entries(responseData)
              .filter(([key]) => !metaProps.includes(key))
          );
        }
      }
      
      setModelAccess(modelAccessData);
    } catch (err) {
      console.error('Error fetching group model access:', err);
      setError('Failed to load model access settings: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [groupId]); 

  useEffect(() => {
    if (groupId) {
      fetchGroupModelAccess();
    }
  }, [groupId, fetchGroupModelAccess]);

  const handleToggleAccess = async (providerId, modelId, currentAccess) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await adminService.updateGroupModelAccess(groupId, modelId, !currentAccess);

      setModelAccess(prev => {
        const newState = { ...prev };
        const provider = Object.keys(newState).find(p =>
          newState[p].some(m => m.id === modelId)
        );

        if (provider) {
          newState[provider] = newState[provider].map(m =>
            m.id === modelId ? { ...m, can_access: !currentAccess } : m
          );
        }

        return newState;
      });

      setSuccess('Model access updated successfully');
    } catch (err) {
      console.error('Error updating model access:', err);
      setError('Failed to update model access');
    } finally {
      setSaving(false);

      if (!error) {
        setTimeout(() => setSuccess(''), 3000);
      }
    }
  };

  const handleResetAccess = async (provider = null) => {
    if (!window.confirm(
      provider
        ? `Reset access to ${provider} models for group "${groupName}"? This will restore default settings.`
        : `Reset all model access for group "${groupName}"? This will restore default settings for all providers.`
    )) {
      return;
    }

    try {
      setResetting(true);
      setError('');
      setSuccess('');

      let response;
      if (provider) {
        const providerId = Object.keys(modelAccess).find(p => p === provider);
        if (!providerId) {
          throw new Error(`Provider ${provider} not found`);
        }

        response = await adminService.resetGroupProviderModels(groupId, providerId);
      } else {
        response = await adminService.resetGroupModels(groupId);
      }

      await fetchGroupModelAccess();

      setSuccess(response.message || 'Model access reset successfully');
    } catch (err) {
      console.error('Error resetting model access:', err);
      setError('Failed to reset model access');
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const providerNames = Object.keys(modelAccess);

  return (
    <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Model Access for Group: {groupName}</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Control which models this group can access
          </p>
        </div>
        <div>
          <button
            onClick={() => handleResetAccess()}
            disabled={resetting}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-dark-border shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
          >
            {resetting ? 'Resetting...' : 'Reset All to Defaults'}
          </button>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="mx-4 mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-700 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mx-4 mb-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-700 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400 dark:text-green-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
            </div>
          </div>
        </div>
      )}

      {providerNames.length === 0 ? (
        <div className="px-4 py-5 sm:p-6 text-center text-gray-500 dark:text-gray-400">
          No models available for access control
        </div>
      ) : (
        <div>
          {providerNames.map(provider => (
            <div key={provider} className="border-t border-gray-200 dark:border-dark-border">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">{provider} Models</h4>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {modelAccess[provider]?.map(model => (
                    <div
                      key={model.id}
                      className={`relative rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-secondary px-6 py-5 shadow-sm flex items-center space-x-3 hover:border-gray-400 dark:hover:border-gray-500 ${model.can_access ? '' : 'opacity-50'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{model.name}</p>
                      </div>
                      <div>
                        <label className="inline-flex items-center cursor-pointer">
                          <div className="relative">
                            <input 
                              type="checkbox" 
                              className="sr-only" 
                              checked={model.can_access} 
                              onChange={() => handleToggleAccess(provider, model.id, model.can_access)}
                              disabled={saving}
                            />
                            <div className={`
                              block w-10 h-6 rounded-full 
                              ${!model.can_access ? 'bg-red-500' : 'bg-green-500'}
                            `}></div>
                            <div className={`
                              dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition 
                              ${model.can_access ? 'transform translate-x-4' : ''}
                            `}></div>
                          </div>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

GroupModelAccess.propTypes = {
  groupId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  groupName: PropTypes.string.isRequired
};

export default GroupModelAccess;
