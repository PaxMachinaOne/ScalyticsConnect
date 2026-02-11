// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { groupService } from '../../../services/admin';
import GroupUserManager from './GroupUserManager';
import GroupModelAccess from './GroupModelAccess';
import GroupPermissions from './GroupPermissions';

const GroupDetails = ({ groupId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); 
  const [error, setError] = useState('');

  const fetchGroupDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const groupData = await groupService.getGroupDetails(groupId);
      
      const processedGroup = {
        ...groupData,
        id: groupData.id || groupId, 
        name: groupData.name || `Group ${groupId}`, 
        description: groupData.description || '',
        users: Array.isArray(groupData.users) ? groupData.users : []
      };
      
      setGroup(processedGroup);
    } catch (err) {
      console.error('Error fetching group details:', err);
      setError('Failed to load group details');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      fetchGroupDetails();
    }
  }, [groupId, fetchGroupDetails]);

  if (loading) {
    return (
      <div className="animate-pulse p-6 space-y-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400 dark:text-red-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h3>
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center p-6">
        <p className="text-gray-500 dark:text-gray-400">Group not found</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
            Group Details: {group.name}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            {group.description || 'No description'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-2 inline-flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400"
        >
          <span className="sr-only">Close panel</span>
          <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border">
        <nav className="-mb-px flex">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`${
                    activeTab === 'users'
                      ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Users ({group.user_count || 0})
                </button>
                <button
                  onClick={() => setActiveTab('models')}
                  className={`${
                    activeTab === 'models'
                      ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Model Access ({group.model_access_count || 0})
                </button>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={`${
                    activeTab === 'permissions'
                      ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300'
                  } whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm`}
                >
                  Permissions ({group.permission_count || 0})
                </button>
        </nav>
      </div>

      {/* Tab content */}
      <div className="px-4 py-5 sm:p-6">
        {group && group.id !== undefined && (
          <>
            {activeTab === 'users' && (
              <GroupUserManager 
                groupId={group.id.toString()} 
                groupName={group.name || `Group ${group.id}`} 
              />
            )}
            {activeTab === 'models' && (
              <GroupModelAccess 
                groupId={group.id.toString()} 
                groupName={group.name || `Group ${group.id}`} 
              />
            )}
            {activeTab === 'permissions' && (
              <GroupPermissions 
                groupId={group.id.toString()} 
                groupName={group.name || `Group ${group.id}`} 
              />
            )}
          </>
        )}
        
        {(!group || group.id === undefined) && (
          <div className="text-center p-6">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400 dark:text-yellow-300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Warning</h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-200">Group ID is not defined. Unable to display details.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

GroupDetails.propTypes = {
  groupId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onClose: PropTypes.func.isRequired
};

export default GroupDetails;
