// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { groupService, userService } from '../../../services/admin';

const GroupUserManager = ({ groupId, groupName }) => {
  const [loading, setLoading] = useState(true);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Define fetchData with useCallback to prevent unnecessary re-renders
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      if (!groupId) {
        throw new Error('Group ID is required but was not provided');
      }

      // Get group details including users
      const groupDetails = await groupService.getGroupDetails(groupId);
      
      // Process users with defensive checks
      const users = Array.isArray(groupDetails?.users) 
        ? groupDetails.users 
        : (groupDetails?.users ? [groupDetails.users] : []);
      setAssignedUsers(users);

      const allUsersResponse = await userService.getUsers({ limit: 1000 });
      
      let allUsersArray = [];
      const allUsersData = allUsersResponse?.data || allUsersResponse;
      
      if (Array.isArray(allUsersData)) {
        allUsersArray = allUsersData;
      } else if (allUsersData?.data && Array.isArray(allUsersData.data)) {
        allUsersArray = allUsersData.data;
      } else if (allUsersData?.users && Array.isArray(allUsersData.users)) {
        allUsersArray = allUsersData.users;
      } else {
        console.warn('Unable to extract users array from response:', allUsersResponse);
        allUsersArray = [];
      }
      
      setAllUsers(allUsersArray);

    } catch (err) {
      console.error('Error fetching group users:', err);
      setError(`Failed to load user data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  // Load group users and all available users
  useEffect(() => {
    if (groupId) {
      fetchData();
    } else {
      console.error('GroupUserManager: No group ID provided');
      setError('No group ID provided');
      setLoading(false);
    }
  }, [groupId, fetchData]);

  // Handle user selection from dropdown
  const handleUserSelect = (e) => {
    setSelectedUser(e.target.value);
  };

  // Add a user to the group
  const handleAddUser = async () => {
    if (!selectedUser) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await groupService.assignUserToGroup(selectedUser, groupId);

      // Refresh data
      await fetchData();
      setSelectedUser('');
      setSuccess('User added to group successfully');
    } catch (err) {
      console.error('Error adding user to group:', err);
      setError(err.message || 'Failed to add user to group');
    } finally {
      setSubmitting(false);
    }
  };

  // Remove a user from the group
  const handleRemoveUser = async (userId, username) => {
    if (!window.confirm(`Remove ${username} from the group?`)) {
      return;
    }

    try {
      setError('');
      setSuccess('');

      await groupService.removeUserFromGroup(userId, groupId);

      // Update the assigned users list
      setAssignedUsers(prev => prev.filter(user => user.id !== userId));
      setSuccess(`${username} removed from group successfully`);
    } catch (err) {
      console.error('Error removing user from group:', err);
      setError(err.message || 'Failed to remove user from group');
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

  // Filter out users who are already in the group
  const availableUsers = allUsers.filter(
    user => !assignedUsers.some(assignedUser => assignedUser.id === user.id)
  );

  return (
    <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
          Users in Group: {groupName}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Manage users assigned to this group
        </p>
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

      {/* Add User Form */}
      <div className="border-t border-gray-200 dark:border-dark-border px-4 py-5 sm:p-6">
        <div className="flex items-end space-x-4">
          <div className="flex-grow">
            <label htmlFor="user-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Add User to Group
            </label>
            <select
              id="user-select"
              value={selectedUser}
              onChange={handleUserSelect}
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-400 dark:focus:border-blue-400 sm:text-sm rounded-md"
              disabled={submitting || availableUsers.length === 0}
            >
              <option value="">Select a user</option>
              {availableUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.username} ({user.email})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddUser}
            disabled={!selectedUser || submitting}
            className={`
              inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white 
              bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800
              ${(!selectedUser || submitting) ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
              </>
            ) : 'Add to Group'}
          </button>
        </div>
        {availableUsers.length === 0 && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            All users are already assigned to this group.
          </p>
        )}
      </div>

      {/* Users List */}
      <div className="border-t border-gray-200 dark:border-dark-border">
        <div className="px-4 py-5 sm:p-6">
          <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-4">Assigned Users</h4>
          
          {assignedUsers.length === 0 ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              No users assigned to this group yet
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-dark-border">
              {assignedUsers.map(user => (
                <li key={user.id} className="py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-secondary px-2 -mx-2 rounded">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{user.username}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveUser(user.id, user.username)}
                    className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

GroupUserManager.propTypes = {
  groupId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  groupName: PropTypes.string.isRequired
};

export default GroupUserManager;
