// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState } from 'react';
import ServiceIntegrationsPanel from './ServiceIntegrationsPanel';
import GlobalApiKeysManager from './GlobalApiKeysManager';
import ModernAlert from '../../common/ModernAlert';

const IntegrationsManager = () => {
  const [activeTab, setActiveTab] = useState('services'); 
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setAlert({ show: false, message: '', type: '' });
  };

  return (
    <div className="container mx-auto px-4">
      {alert.show && (
        <ModernAlert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert({ ...alert, show: false })}
        />
      )}

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="sm:hidden">
          <label htmlFor="integration-tabs" className="sr-only">Select integration section</label>
          <select
            id="integration-tabs"
            name="integration-tabs"
            className="block w-full rounded-md border-gray-300 dark:border-dark-border bg-white dark:bg-dark-primary py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 dark:text-dark-text-primary"
            value={activeTab}
            onChange={(e) => handleTabChange(e.target.value)}
          >
            <option value="services">OAuth Services</option>
            <option value="api-keys">Global API Keys</option>
          </select>
        </div>
        <div className="hidden sm:block">
          <nav className="flex space-x-4 border-b border-gray-200 dark:border-dark-border" aria-label="Tabs">
            <button
              onClick={() => handleTabChange('services')}
              className={`${
                activeTab === 'services'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              aria-current={activeTab === 'services' ? 'page' : undefined}
            >
              OAuth Services
            </button>
            <button
              onClick={() => handleTabChange('api-keys')}
              className={`${
                activeTab === 'api-keys'
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              aria-current={activeTab === 'api-keys' ? 'page' : undefined}
            >
              Global API Keys
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 gap-6">
        {activeTab === 'services' && (
          <ServiceIntegrationsPanel />
        )}
        
        {activeTab === 'api-keys' && (
          <GlobalApiKeysManager />
        )}
      </div>
    </div>
  );
};

export default IntegrationsManager;
