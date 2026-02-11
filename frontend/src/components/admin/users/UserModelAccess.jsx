// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import adminService from '../../../services/adminService';
import apiService from '../../../services/apiService';
import GroupPicker from '../groups/GroupPicker';

const UserModelAccess = ({ userId, username }) => {
  const [loading, setLoading] = useState(true);
  const [modelAccess, setModelAccess] = useState({});
  const [userGroups, setUserGroups] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showGroupOptions, setShowGroupOptions] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUserData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const modelAccessWithGroupsResponse = await apiService.get(`/admin/users/${userId}/models/groups`);
      
      const fullResponseData = modelAccessWithGroupsResponse;
      
      let userGroupsArray = [];
      
      if (fullResponseData.userGroups && Array.isArray(fullResponseData.userGroups)) {
        userGroupsArray = fullResponseData.userGroups;
      } else if (fullResponseData.data && fullResponseData.data.userGroups && Array.isArray(fullResponseData.data.userGroups)) {
        userGroupsArray = fullResponseData.data.userGroups;
      } else if (fullResponseData.groups && Array.isArray(fullResponseData.groups)) {
        userGroupsArray = fullResponseData.groups;
      }
      
      if (!userGroupsArray.length) {
        try {
          const userResponse = await apiService.get(`/admin/users/${userId}`);
          
          const userData = userResponse?.data || userResponse;
          if (userData.data && userData.data.groups && Array.isArray(userData.data.groups)) {
            userGroupsArray = userData.data.groups;
          } else if (userData.groups && Array.isArray(userData.groups)) {
            userGroupsArray = userData.groups;
          }
        } catch (userErr) {
          console.error('Error in user data fallback:', userErr);
        }
      }
      
      setUserGroups(userGroupsArray);
      
      if (!userGroupsArray.length && Array.isArray(modelAccessWithGroupsResponse.userGroups)) {
        userGroupsArray = modelAccessWithGroupsResponse.userGroups;
        setUserGroups(userGroupsArray);
      }
      
      let modelAccessData = {};
      
      if (typeof fullResponseData === 'object' && fullResponseData !== null) {
        if (fullResponseData.data && typeof fullResponseData.data === 'object' && 
            !Array.isArray(fullResponseData.data) && 
            Object.keys(fullResponseData.data).length > 0) {
          modelAccessData = fullResponseData.data;
        } else {
          const specialProps = ['userGroups', 'success', 'message', 'groups'];
          modelAccessData = Object.fromEntries(
            Object.entries(fullResponseData)
              .filter(([key]) => !specialProps.includes(key))
          );
        }
      }
      
      setModelAccess(modelAccessData);

    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to load user data: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchUserData();
    }
  }, [userId, fetchUserData]);

  const handleGroupAction = async (action) => {
    if (!selectedGroup) {
      setError('Please select a group first');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      if (action === 'add') {
        await apiService.post(`/admin/users/${userId}/groups`, { groupId: selectedGroup });
        
        setTimeout(async () => {
          try {
            const groupResponse = await apiService.get(`/admin/users/${userId}/models/groups`);
            
            let userGroupsArray = [];
            const groupData = groupResponse?.data || groupResponse;
            
            if (groupData.groups && Array.isArray(groupData.groups)) {
              userGroupsArray = groupData.groups;
            } else if (groupData.userGroups && Array.isArray(groupData.userGroups)) {
              userGroupsArray = groupData.userGroups;
            } else if (Array.isArray(groupData)) {
              userGroupsArray = groupData;
            } else if (groupData.data && Array.isArray(groupData.data)) {
              userGroupsArray = groupData.data;
            }
            
            if (userGroupsArray.length === 0) {
              const userResponse = await apiService.get(`/admin/users/${userId}`);
              if (userResponse?.data?.groups && Array.isArray(userResponse.data.groups)) {
                userGroupsArray = userResponse.data.groups;
              }
            }
            
            if (userGroupsArray.length === 0) {
              const groupDetails = await apiService.get(`/admin/groups/${selectedGroup}`);
              if (groupDetails?.data) {
                const groupInfo = {
                  id: selectedGroup,
                  name: groupDetails.data.name || 'Unknown Group'
                };
                userGroupsArray = [groupInfo];
              }
            }
            setUserGroups(userGroupsArray);
            
            setSaving(false);
            
            if (userGroupsArray.length > 0) {
              setSuccess(`User added to group "${userGroupsArray[0].name}" successfully.`);
            } else {
              setSuccess(`User added to group successfully. Refresh the page to see updated group membership.`);
            }
            
            await fetchUserData();
          } catch (refreshErr) {
            console.error('Error refreshing data after group assignment:', refreshErr);
            setSaving(false);
            setSuccess(`User added to group successfully. You may need to refresh the page to see updated group membership.`);
          }
        }, 1000);
      } else if (action === 'copy') {
        await adminService.copyGroupPermissionsToUser(userId, selectedGroup);
        setSuccess('Permissions copied from group successfully');
        
        await fetchUserData();
        setSaving(false);
      }
      
      setShowGroupOptions(false);
      setSelectedGroup('');
    } catch (err) {
      console.error('Error performing group action:', err);
      setError(`Failed to ${action === 'add' ? 'add user to group' : 'copy permissions from group'}`);
      setSaving(false);
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
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Model Access for {username}</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            View model access granted through group memberships
          </p>
        </div>
        <div>
          {!showGroupOptions && (
            <button
              onClick={() => setShowGroupOptions(true)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
            >
              Add User to Group
            </button>
          )}
        </div>
      </div>

      {/* Group Options */}
      {showGroupOptions && (
        <div className="bg-gray-50 dark:bg-dark-secondary px-4 py-4 sm:px-6 border-b border-gray-200 dark:border-dark-border">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Group Operations</h4>
          <div className="flex space-x-4">
            <div className="flex-grow">
              <GroupPicker
                selectedGroupId={selectedGroup}
                onGroupSelect={setSelectedGroup}
              />
            </div>
            <div className="flex items-end space-x-2">
              <button
                onClick={() => handleGroupAction('add')}
                disabled={!selectedGroup || saving}
                className={`
                  inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium 
                  rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 
                  focus:ring-offset-2 focus:ring-green-500
                  ${(!selectedGroup || saving) ? 'opacity-50 cursor-not-allowed' : ''} dark:bg-green-700 dark:hover:bg-green-800
                `}
              >
                {saving ? 'Adding...' : 'Add to Group'}
              </button>
              
              <button
                onClick={() => handleGroupAction('copy')}
                disabled={!selectedGroup || saving}
                className={`
                  inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm leading-4 font-medium 
                  rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 
                  focus:ring-offset-2 focus:ring-blue-500
                  ${(!selectedGroup || saving) ? 'opacity-50 cursor-not-allowed' : ''} dark:bg-blue-700 dark:hover:bg-blue-800
                `}
              >
                {saving ? 'Copying...' : 'Copy Permissions'}
              </button>
            </div>
          </div>
          <div className="mt-2 flex space-x-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              <span className="font-medium dark:text-gray-300">Add to Group:</span> Add the user to the selected group, inheriting all model access permissions from that group.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              <span className="font-medium">Copy Permissions:</span> Copy the model permissions from the selected group to this user without adding them to the group.
            </p>
          </div>
        </div>
      )}

      {/* User's current groups */}
      {userGroups && userGroups.length > 0 ? (
        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 border-b border-blue-100 dark:border-blue-800">
          <div className="flex items-center">
            <span className="text-sm font-medium text-blue-700 dark:text-dark-link mr-2">Group Memberships:</span>
            <div className="flex flex-wrap gap-2">
              {userGroups.map(group => {
                // Special styling for system groups
                let bgColor = "bg-blue-100";
                let textColor = "text-blue-800";
                
                // Administrator group - red
                if (group.name === "Administrator") {
                  bgColor = "bg-red-100 dark:bg-red-900/50";
                  textColor = "text-red-800 dark:text-red-300";
                } 
                // Power Users group - purple
                else if (group.name === "Power Users") {
                  bgColor = "bg-purple-100 dark:bg-purple-900/50"; 
                  textColor = "text-purple-800 dark:text-purple-300";
                }
                
                return (
                  <span 
                    key={group.id} 
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor}`}
                  >
                    {group.name}
                  </span>
                );
              })}
            </div>
          </div>
          <p className="mt-1 text-xs text-blue-600 dark:text-dark-text-primary">
            This user inherits model access from these groups.
          </p>
        </div>
      ) : (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 px-4 py-3 border-b border-yellow-100 dark:border-yellow-800">
          <div className="flex items-center">
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">No Group Memberships Found</span>
          </div>
          <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
            This user is not a member of any groups. Add them to a group to inherit model access permissions.
          </p>
        </div>
      )}

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
                  <h4 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">{provider} Enabled Models</h4>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.isArray(modelAccess[provider]) ? (
                    modelAccess[provider].map(model => (
                      <div
                        key={model.id}
                        className={`
                          relative rounded-lg px-6 py-5 shadow-sm flex items-center space-x-3
                          ${model.can_access
                            ? 'border-2 border-green-500 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                            : 'border-2 border-red-300 bg-white dark:bg-dark-primary dark:border-red-700'
                          }
                        `}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{model.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {model.can_access && model.groups && model.groups.length > 0
                              ? `Access via groups: ${model.groups.map(g => g.name).join(', ')}`
                              : 'No group access'
                            }
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-3 text-center text-gray-500 dark:text-gray-400">
                      No models enabled for {username} from this provider
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

UserModelAccess.propTypes = {
  userId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  username: PropTypes.string.isRequired
};

export default UserModelAccess;
