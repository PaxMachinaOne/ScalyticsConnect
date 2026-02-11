// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';
import { groupService } from '../../../services/admin';
import GroupDetails from './GroupDetails';
import PermissionErrorMessage from '../common/PermissionErrorMessage';
import ModernAlert from '../../common/ModernAlert';

const GroupManager = () => {
  const [groups, setGroups] = useState([]);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: ''
  });
  const [loading, setLoading] = useState(true); 
  const [refreshKey, setRefreshKey] = useState(0); 
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteWarning, setShowDeleteWarning] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, [refreshKey]);
  
  // Error message auto-dismiss function
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('');
      }, 5000); 
      
      return () => clearTimeout(timer);
    }
  }, [error]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await groupService.getGroups();
      
      let groupsArray = [];
      
      const responseData = response?.data || response;
      
      if (Array.isArray(responseData)) {
        groupsArray = responseData;
      } else if (responseData?.data && Array.isArray(responseData.data)) {
        groupsArray = responseData.data;
      } else if (responseData?.groups && Array.isArray(responseData.groups)) {
        groupsArray = responseData.groups;
      } else if (responseData?.items && Array.isArray(responseData.items)) {
        groupsArray = responseData.items;
      } else if (responseData?.results && Array.isArray(responseData.results)) {
        groupsArray = responseData.results;
      } else {
        console.error('Unable to extract groups array from response:', response);
        groupsArray = [];
      }
      
      setGroups([...groupsArray]);
      setError('');
    } catch (err) {
      console.error('Error fetching groups:', err);
      setError('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e, target) => {
    const { name, value } = e.target;
    
    if (target === 'new') {
      setNewGroup(prev => ({
        ...prev,
        [name]: value
      }));
    } else {
      setEditingGroup(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const addGroup = async () => {
    try {
      setError('');
      setSuccess('');
      
      if (!newGroup.name) {
        setError('Group name is required');
        return;
      }
      
      const response = await groupService.createGroup(newGroup);
      
      if (response && (response.data || response.success)) {
        setNewGroup({
          name: '',
          description: ''
        });
        
        setSuccess('Group added successfully');
        
        setLoading(true);
        
        setTimeout(() => {
          setRefreshKey(prevKey => prevKey + 1);
        }, 500);
      }
    } catch (err) {
      console.error('Error adding group:', err);
      setError(err.message || 'Failed to add group');
    }
  };

  const startEditGroup = (group) => {
    setEditingGroup({...group});
  };

  const cancelEdit = () => {
    setEditingGroup(null);
  };

  const saveGroupChanges = async () => {
    try {
      setError('');
      setSuccess('');
      
      if (!editingGroup.name) {
        setError('Group name is required');
        return;
      }
      
      const response = await groupService.updateGroup(editingGroup.id, {
        name: editingGroup.name,
        description: editingGroup.description
      });
      
      if (response && (response.data || response.success)) {
        setSuccess('Group updated successfully');
        setEditingGroup(null);
        
        setLoading(true);
        
        setTimeout(() => {
          setRefreshKey(prevKey => prevKey + 1);
        }, 500);
      }
    } catch (err) {
      console.error('Error updating group:', err);
      setError(err.message || 'Failed to update group');
    }
  };

  const confirmDeleteGroup = (group) => {
    setGroupToDelete(group);
    setShowDeleteWarning(true);
  };

  const cancelDelete = () => {
    setGroupToDelete(null);
    setShowDeleteWarning(false);
  };

  const executeDeleteGroup = async () => {
    try {
      setError('');
      setSuccess('');
      
      const groupDetails = await groupService.getGroupDetails(groupToDelete.id);
      
      if (groupDetails.userCount > 0) {
        setError(`Cannot delete group. It contains ${groupDetails.userCount} users. Remove all users first.`);
        setShowDeleteWarning(false);
        setGroupToDelete(null);
        return;
      }
      
      const response = await groupService.deleteGroup(groupToDelete.id);
      
      if (response && (response.data || response.success)) {
        setSuccess('Group deleted successfully');
        setShowDeleteWarning(false);
        setGroupToDelete(null);
        
        setLoading(true);
        
        setTimeout(() => {
          setRefreshKey(prevKey => prevKey + 1);
        }, 500);
      }
    } catch (err) {
      console.error('Error deleting group:', err);
      setError(err.message || 'Failed to delete group');
    } finally {
      setShowDeleteWarning(false);
      setGroupToDelete(null);
    }
  };

  const handleViewDetails = (group) => {
    setSelectedGroup(group);
    setShowDetails(true);
  };

  const closeDetails = () => {
    setShowDetails(false);
    setSelectedGroup(null);
    
    // Force complete refresh
    setRefreshKey(prevKey => prevKey + 1);
  };

  if (loading && groups.length === 0) {
    return (
      <div className="animate-pulse p-6 space-y-4">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  // If group details are being shown, render the details component
  if (showDetails && selectedGroup) {
    return <GroupDetails groupId={selectedGroup.id} onClose={closeDetails} />;
  }

  return (
    <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">User Groups</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Manage groups for organizing users
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={fetchGroups}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
          >
            <svg className="-ml-1 mr-2 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Status messages - only show if no modal is open */}
      {error && error === 'Failed to load groups' ? (
        <PermissionErrorMessage resourceType="groups" error={error} />
      ) : (error && !editingGroup && !showDeleteWarning && !showDetails) ? (
        <div className="mx-4">
          <ModernAlert 
            type="error" 
            message={error} 
            onDismiss={() => setError('')}
          />
        </div>
      ) : null}
      
      {success && (
        <div className="mx-4">
          <ModernAlert 
            type="success" 
            message={success} 
            onDismiss={() => setSuccess('')}
          />
        </div>
      )}

      {/* Groups list */}
      <div className="overflow-x-auto border border-gray-200 dark:border-dark-border rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-secondary">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Group Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Description
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Users
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
            {groups.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  No groups found
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} className="hover:bg-gray-50 dark:hover:bg-dark-secondary">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-purple-600 dark:bg-purple-700 flex items-center justify-center text-white">
                        <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{group.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {group.description || 'No description'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {group.userCount || 0} users
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                      onClick={() => handleViewDetails(group)}
                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 mr-3"
                    >
                      Manage
                    </button>
                    <button 
                      onClick={() => startEditGroup(group)}
                      className="text-blue-600 dark:text-dark-link hover:text-blue-900 dark:hover:text-dark-link mr-3"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => confirmDeleteGroup(group)}
                      className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Add New Group */}
      <div className="px-4 py-5 sm:px-6 border-t border-gray-200 dark:border-dark-border">
        <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-4">Add New Group</h3>
        
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-2 sm:gap-x-4">
          <div>
            <label htmlFor="new-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Group Name
            </label>
            <input
              type="text"
              id="new-name"
              name="name"
              value={newGroup.name}
              onChange={(e) => handleInputChange(e, 'new')}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-dark-text-primary"
            />
          </div>
          
          <div>
            <label htmlFor="new-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <input
              type="text"
              id="new-description"
              name="description"
              value={newGroup.description}
              onChange={(e) => handleInputChange(e, 'new')}
              className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-dark-text-primary"
            />
          </div>
        </div>
        
        <div className="mt-4">
          <button
            type="button"
            onClick={addGroup}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"
          >
            Add Group
          </button>
        </div>
      </div>

      {/* Edit Group Modal */}
      {editingGroup && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white dark:bg-dark-primary px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary" id="modal-title">
                      Edit Group
                    </h3>
                    
                    {/* Modern error message inside edit modal */}
                    {error && (
                      <ModernAlert 
                        type="error" 
                        message={error} 
                        onDismiss={() => setError('')}
                      />
                    )}
                    
                    <div className="mt-4 space-y-4">
                      <div>
                        <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Group Name
                        </label>
                        <input
                          type="text"
                          id="edit-name"
                          name="name"
                          value={editingGroup.name}
                          onChange={(e) => handleInputChange(e, 'edit')}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-dark-text-primary"
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Description
                        </label>
                        <input
                          type="text"
                          id="edit-description"
                          name="description"
                          value={editingGroup.description || ''}
                          onChange={(e) => handleInputChange(e, 'edit')}
                          className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-dark-text-primary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={saveGroupChanges}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 dark:bg-blue-700 text-base font-medium text-white hover:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Save
                </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-dark-border shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                        >
                          Cancel
                        </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteWarning && (
        <div className="fixed z-10 inset-0 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity" aria-hidden="true">
              <div className="absolute inset-0 bg-gray-500 dark:bg-dark-primary opacity-75"></div>
            </div>

            <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

            <div className="inline-block align-bottom bg-white dark:bg-dark-primary rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white dark:bg-dark-primary px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-red-600 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary" id="modal-title">
                      Confirm Deletion
                    </h3>
                    
                    {/* Modern error message inside delete modal */}
                    {error && (
                      <ModernAlert 
                        type="error" 
                        message={error} 
                        onDismiss={() => setError('')}
                      />
                    )}
                    
                    <div className="mt-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Are you sure you want to delete the group "{groupToDelete?.name}"? This action cannot be undone.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={executeDeleteGroup}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 dark:bg-red-700 text-base font-medium text-white hover:bg-red-700 dark:hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-800 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={cancelDelete}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-dark-border shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupManager;
