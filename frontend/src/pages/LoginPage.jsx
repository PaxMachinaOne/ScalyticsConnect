// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/common/Logo';
import { loginService } from '../services/auth';
import integrationService from '../services/integrationService';
import { useAuth } from '../contexts/AuthContext'; 
import SessionExpiredAlert from '../components/auth/SessionExpiredAlert';
import AuthErrorAlert from '../components/auth/AuthErrorAlert';
import OAuthLoginSection from '../components/auth/OAuthLoginSection';
import PasswordLoginForm from '../components/auth/PasswordLoginForm';
import { getProviderDisplayName } from '../components/auth/OAuthProviderIcons';

/**
 * Login page component handling both OAuth and password login
 */
const LoginPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeOAuthProvider, setActiveOAuthProvider] = useState(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { login: contextLogin } = useAuth(); 
  
  // Fetch active OAuth providers on component mount
  useEffect(() => {
    const fetchOAuthProviders = async () => {
      try {
        setLoadingProviders(true);
        // Get auth configuration using the integration service
        const response = await integrationService.getAuthConfig();
        
        // Check if we have any enabled providers
        if (response && Object.keys(response).length > 0) {
          // Find the first enabled provider
          // Priority order: GitHub, Google, Microsoft, Azure AD, Okta
          const providerPriority = ['github', 'google', 'microsoft', 'azure_ad', 'okta'];
          
          // Find the first enabled provider in our priority list
          let firstEnabledProvider = null;
          for (const provider of providerPriority) {
            if (response[provider]) {
              firstEnabledProvider = provider;
              break;
            }
          }
          
          // If we found a provider, set it as active
          if (firstEnabledProvider) {
            setActiveOAuthProvider({
              provider: firstEnabledProvider,
              displayName: getProviderDisplayName(firstEnabledProvider)
            });
          }
        }
      } catch (error) {
        console.error('Error fetching OAuth providers:', error);
        // If we can't fetch providers, fall back to password login
        setActiveOAuthProvider(null);
      } finally {
        setLoadingProviders(false);
      }
    };
    
    fetchOAuthProviders();
  }, []);
  
  // Handle OAuth login
  const handleOAuthLogin = () => {
    if (!activeOAuthProvider) return;
    
    const provider = activeOAuthProvider.provider;
    // Redirect to the OAuth authorization URL
    window.location.href = `/auth/${provider}/login`;
  };

  // Handle input changes in the login form
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { username, password } = formData;
      
      if (!username || !password) {
        setError('Please enter both username and password');
        setLoading(false);
        return;
      }
      
      const response = await loginService.login(formData);
      
      if (response.success && response.user && response.token) {
        // Call context login to update global state
        contextLogin(response.user, response.token); 
        
        // Redirect to dashboard or previous page
        const redirectTo = location.state?.from?.pathname || '/dashboard';
        navigate(redirectTo); 
      } else {
        // Use error message from response, or provide a default
        setError(response.message || 'Login failed. Please check your credentials.');
      }
    } catch (error) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-primary py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Logo and title */}
        <div className="text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-dark-text-primary">
            Scalytics Connect
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-dark-text-secondary">
          Your private AI platform to securely run and manage your most powerful models — with full data privacy.
          </p>
        </div>
        
        {/* Authentication state alerts */}
        <SessionExpiredAlert />
        
        {/* Authentication error alert */}
        <AuthErrorAlert message={error} />
        
        {/* Loading indicator for OAuth providers */}
        {loadingProviders ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 dark:border-blue-400"></div>
          </div>
        ) : (
          <>
            {/* OAuth login section */}
            <OAuthLoginSection 
              activeOAuthProvider={activeOAuthProvider} 
              handleOAuthLogin={handleOAuthLogin} 
            />
            
            {/* Password login form - always available for admin access */}
            <PasswordLoginForm 
              formData={formData}
              handleChange={handleChange}
              handleSubmit={handleSubmit}
              loading={loading}
              hasOAuthProvider={!!activeOAuthProvider}
            />
          </>
        )}

        {/* Sales sentence */}
        <p className="mt-8 text-center text-sm text-gray-600 dark:text-dark-text-secondary">
          No access yet? Contact us here: 
          <a href="https://www.scalytics.io/frontrunner" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:text-blue-500 dark:text-dark-link dark:hover:text-dark-link">
          &nbsp;Frontrunner Program
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
