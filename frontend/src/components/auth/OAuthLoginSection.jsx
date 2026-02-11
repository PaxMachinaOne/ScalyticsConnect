// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React from 'react';
import { getOAuthProviderIcon } from './OAuthProviderIcons';

/**
 * Component that displays OAuth login buttons and divider
 * @param {Object} props - Component props
 * @param {Object} props.activeOAuthProvider - The active OAuth provider object
 * @param {Function} props.handleOAuthLogin - Function to handle OAuth login
 */
const OAuthLoginSection = ({ activeOAuthProvider, handleOAuthLogin }) => {
  if (!activeOAuthProvider) return null;

  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sign in using your {activeOAuthProvider.displayName} account
        </p>
      </div>
      
      <button
        type="button"
        onClick={handleOAuthLogin}
        className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-900"
      >
        {getOAuthProviderIcon(activeOAuthProvider.provider)}
        <span className="ml-2">Continue with {activeOAuthProvider.displayName}</span>
      </button>
      
      <div className="relative mt-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-gray-50 dark:bg-dark-primary text-gray-500 dark:text-gray-400">OR</span>
        </div>
      </div>
    </div>
  );
};

export default OAuthLoginSection;
