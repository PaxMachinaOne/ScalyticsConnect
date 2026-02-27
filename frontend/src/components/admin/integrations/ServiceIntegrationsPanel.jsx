// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';
import integrationService from '../../../services/integrationService';
import IntegrationList from './IntegrationList';
import IntegrationForm from './IntegrationForm';
import ModernAlert from '../../common/ModernAlert';

const ServiceIntegrationsPanel = () => {
  const [integrations, setIntegrations] = useState([]);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  const fetchIntegrations = async () => {
    try {
      setIsLoading(true);
      const response = await integrationService.getAllIntegrations();
      setIntegrations(response.data || []);
    } catch (error) {
      console.error('Error fetching integrations:', error);
      setAlert({
        show: true,
        message: 'Failed to load integrations. Please try again.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const handleEditIntegration = (integration) => {
    setSelectedIntegration(integration);
    setIsCreating(false);
  };

  const handleCreateIntegration = () => {
    setSelectedIntegration(null);
    setIsCreating(true);
  };

  const handleSaveIntegration = async (integrationData) => {
    try {
      setIsLoading(true);
      
      if (isCreating) {
        await integrationService.createIntegration(integrationData);
        setAlert({
          show: true,
          message: 'Integration created successfully',
          type: 'success'
        });
      } else {
        await integrationService.updateIntegration(selectedIntegration.id, integrationData);
        setAlert({
          show: true,
          message: 'Integration updated successfully',
          type: 'success'
        });
      }
      
      setSelectedIntegration(null);
      setIsCreating(false);
      await fetchIntegrations();
    } catch (error) {
      console.error('Error saving integration:', error);
      setAlert({
        show: true,
        message: `Failed to ${isCreating ? 'create' : 'update'} integration: ${error.response?.data?.message || error.message}`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteIntegration = async (integrationId) => {
    if (!window.confirm('Are you sure you want to delete this integration?')) {
      return;
    }
    
    try {
      setIsLoading(true);
      await integrationService.deleteIntegration(integrationId);
      
      setAlert({
        show: true,
        message: 'Integration deleted successfully',
        type: 'success'
      });
      
      if (selectedIntegration && selectedIntegration.id === integrationId) {
        setSelectedIntegration(null);
        setIsCreating(false);
      }
      
      await fetchIntegrations();
    } catch (error) {
      console.error('Error deleting integration:', error);
      setAlert({
        show: true,
        message: `Failed to delete integration: ${error.response?.data?.message || error.message}`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleIntegration = async (integrationId) => {
    try {
      setIsLoading(true);
      const response = await integrationService.toggleIntegrationStatus(integrationId);
      
      setAlert({
        show: true,
        message: `Integration ${response.data.enabled ? 'enabled' : 'disabled'} successfully`,
        type: 'success'
      });
      
      await fetchIntegrations();
    } catch (error) {
      console.error('Error toggling integration:', error);
      setAlert({
        show: true,
        message: `Failed to update integration status: ${error.response?.data?.message || error.message}`,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedIntegration(null);
    setIsCreating(false);
  };

  return (
    <div className="w-full">
      {alert.show && (
        <ModernAlert
          message={alert.message}
          type={alert.type}
          onClose={() => setAlert({ ...alert, show: false })}
        />
      )}
      
      {/* Integration Listing */}
      {!isCreating && !selectedIntegration && integrations.length > 0 && (
        <div className="bg-white dark:bg-dark-primary rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-dark-text-primary">OAuth Service Integrations (Experimental)</h2>
            <button
              onClick={handleCreateIntegration}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
              disabled={isLoading}
            >
              Add New
            </button>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center my-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <IntegrationList
              integrations={integrations}
              onEdit={handleEditIntegration}
              onDelete={handleDeleteIntegration}
              onToggle={handleToggleIntegration}
            />
          )}
        </div>
      )}
      
      {/* Form */}
      {(isCreating || selectedIntegration) && (
        <div className="bg-white dark:bg-dark-primary rounded-lg shadow p-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-dark-text-primary mb-4">
            {isCreating ? 'Add New Integration' : 'Edit Integration'}
          </h2>

          <IntegrationForm
            integration={selectedIntegration}
            onSave={handleSaveIntegration}
            onCancel={handleCancel}
            isLoading={isLoading}
          />
        </div>
      )}
      {/* Empty State */}
      {!isCreating && !selectedIntegration && integrations.length === 0 && (
        <div className="bg-white dark:bg-dark-primary rounded-lg shadow p-6">
          <div className="text-center">
            <svg 
              className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-dark-text-secondary">Configure OAuth Integrations</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Configure authentication providers for third-party services like Google, GitHub, and more.
            </p>
            <div className="mt-6 mb-2">
              <button
                type="button"
                onClick={handleCreateIntegration}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg 
                  className="-ml-1 mr-2 h-5 w-5" 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 20 20" 
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add Integration
              </button>
            </div>
          </div>
          
          <div className="mt-8 border-t border-gray-200 dark:border-dark-border pt-6">
            <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-secondary mb-4">Setting Up OAuth Integrations</h4>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Provider Setup</p>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  First, create an OAuth application in the provider's developer portal. For example:
                </p>
                <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-500 dark:text-gray-400">
                  <li>Google: Google Cloud Console → APIs & Services → Credentials</li>
                  <li>GitHub: GitHub Developer Settings → OAuth Apps</li>
                  <li>Microsoft: Azure Portal → App Registrations (for Azure AD) or Microsoft Identity Platform</li>
                </ul>
              </div>
              <div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Redirect URIs & Callback URLs</p>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  Configure the following redirect URIs in your provider's dashboard:
                </p>
                <ul className="ml-5 mt-1 space-y-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                  <li>Google: <span className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://yourdomain.com/auth/google/callback</span></li>
                  <li>GitHub: <span className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://yourdomain.com/auth/github/callback</span></li>
                  <li>Microsoft: <span className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://yourdomain.com/auth/microsoft/callback</span></li>
                  <li>Azure AD: <span className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://yourdomain.com/auth/azure/callback</span></li>
                </ul>
              </div>
              <div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Azure AD vs Microsoft Personal</p>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  We provide two Microsoft options:
                </p>
                <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-500 dark:text-gray-400">
                  <li><strong>Microsoft Personal</strong>: For consumer Microsoft accounts (outlook.com, hotmail.com)</li>
                  <li><strong>Azure AD</strong>: For organizational accounts with tenant-specific configuration</li>
                </ul>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                  For Azure AD, the "Tenant ID" field is important. Use:
                </p>
                <ul className="ml-5 mt-1 text-gray-500 dark:text-gray-400">
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">organizations</code> - Allow any organizational account</li>
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">consumers</code> - Allow only personal accounts</li>
                  <li><code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">common</code> - Allow any Microsoft account</li>
                  <li>Your specific tenant ID (e.g., <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">a1b2c3d4-e5f6...</code>) - Restrict to your organization only</li>
                </ul>
              </div>
              <div>
                <p className="text-gray-700 dark:text-gray-300 font-medium">Security Best Practices</p>
                <ul className="list-disc ml-5 mt-1 space-y-1 text-gray-500 dark:text-gray-400">
                  <li>Keep client secrets confidential - never expose them in client-side code</li>
                  <li>Regenerate client secrets periodically for enhanced security</li>
                  <li>Limit requested scopes to only what your application needs</li>
                  <li>For Azure AD, consider using domain restrictions to limit access to your organization's domains</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceIntegrationsPanel;
