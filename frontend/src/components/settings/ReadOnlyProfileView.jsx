// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React from 'react';
import PropTypes from 'prop-types';
import UserAvatar from './UserAvatar';

/**
 * Displays a read-only view of user profile information for OAuth users
 * @param {Object} props - Component props
 * @param {Object} props.user - User profile data
 * @param {Object} props.oauthProvider - Information about the OAuth provider
 */
const ReadOnlyProfileView = ({ user, oauthProvider }) => {
  return (
    <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Profile Information</h3>
          </div>
          <div>
            <UserAvatar user={user} size="md" editable={false} />
          </div>
        </div>
        
        <div className="mt-4 mb-6 p-4 rounded-md bg-blue-50 dark:bg-blue-900/20 border dark:border-blue-800">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-800 dark:text-dark-text-primary">
                External Authentication Active
              </p>
              <p className="mt-2 text-sm text-blue-700 dark:text-dark-text-primary">
                Your profile information is managed by {oauthProvider.displayName}. 
                Changes to basic profile information must be made through your {oauthProvider.displayName} account.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-5 border-t border-gray-200 dark:border-dark-border pt-5">
          <dl className="sm:divide-y sm:divide-gray-200 dark:sm:divide-dark-border">
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Username</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2">
                {user.username || 'Not available'}
              </dd>
            </div>
            
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email address</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2">
                {user.email || 'Not available'}
              </dd>
            </div>
            
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Authentication method</dt>
              <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2 flex items-center">
                <span className="inline-block mr-2 text-sm font-medium text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 px-2 py-1 rounded-md">
                  {oauthProvider.displayName}
                </span>
              </dd>
            </div>
            
            {user.isAdmin && (
              <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-dark-secondary">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Role</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-dark-text-primary sm:mt-0 sm:col-span-2">
                  <span className="inline-block mr-2 text-sm font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded-md">
                    Administrator
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
};

ReadOnlyProfileView.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    username: PropTypes.string,
    email: PropTypes.string,
    isAdmin: PropTypes.bool
  }).isRequired,
  oauthProvider: PropTypes.shape({
    provider: PropTypes.string.isRequired,
    displayName: PropTypes.string.isRequired
  }).isRequired
};

export default ReadOnlyProfileView;
