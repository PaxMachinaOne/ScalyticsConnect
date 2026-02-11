// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { permissionService } from '../../../services/admin';

const GroupPermissions = ({ groupId, groupName }) => {
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [groupPermissions, setGroupPermissions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Load permissions data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError('');
        
        const allPermissionsResponse = await permissionService.getAllPermissions();
        let availablePermissionsArray = [];
        
        const allPermissionsData = allPermissionsResponse?.data || allPermissionsResponse;
        
        if (Array.isArray(allPermissionsData)) {
          availablePermissionsArray = allPermissionsData;
        } else if (allPermissionsData?.data && Array.isArray(allPermissionsData.data)) {
          availablePermissionsArray = allPermissionsData.data;
        } else if (allPermissionsData?.permissions && Array.isArray(allPermissionsData.permissions)) {
          availablePermissionsArray = allPermissionsData.permissions;
        } else if (allPermissionsData?.items && Array.isArray(allPermissionsData.items)) {
          availablePermissionsArray = allPermissionsData.items;
        } else {
          console.error('Invalid permissions data format:', allPermissionsData);
          availablePermissionsArray = [];
        }
        setAvailablePermissions(availablePermissionsArray);
        
        const groupPermissionsResponse = await permissionService.getGroupPermissions(groupId);
        
        let groupPermissionsArray = [];
        
        const groupPermissionsData = groupPermissionsResponse?.data || groupPermissionsResponse;
        
        if (Array.isArray(groupPermissionsData)) {
          groupPermissionsArray = groupPermissionsData;
        } else if (groupPermissionsData?.data && Array.isArray(groupPermissionsData.data)) {
          groupPermissionsArray = groupPermissionsData.data;
        } else if (groupPermissionsData?.permissions && Array.isArray(groupPermissionsData.permissions)) {
          groupPermissionsArray = groupPermissionsData.permissions;
        } else if (groupPermissionsData?.items && Array.isArray(groupPermissionsData.items)) {
          groupPermissionsArray = groupPermissionsData.items;
        } else {
          console.error('Invalid group permissions data format:', groupPermissionsData);
          groupPermissionsArray = [];
        }
        
        setGroupPermissions(groupPermissionsArray);
        
        const permissionsList = availablePermissionsArray.map(permission => {
          const isGranted = groupPermissionsArray.some(p => p.id === permission.id);
          
          return {
            ...permission,
            isGranted
          };
        });
        
        setPermissions(permissionsList);
      } catch (err) {
        console.error('Error fetching permissions:', err);
        setError('Failed to load permissions data');
      } finally {
        setLoading(false);
      }
    };
    
    if (groupId) {
      fetchData();
    }
  }, [groupId, groupName]);

  const togglePermission = async (permissionId, isCurrentlyGranted) => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
            
      let response;
      
      if (isCurrentlyGranted) {
        response = await permissionService.revokePermissionFromGroup(groupId, permissionId);
        
        const isSuccess = 
          response?.success === true || 
          response?.data?.success === true ||
          (response?.status && [200, 201, 204].includes(response.status));
        
        if (isSuccess) {
          setSuccess(`Permission successfully revoked from "${groupName}" group`);
          
          // Update permissions state
          setPermissions(prevPermissions => 
            prevPermissions.map(p => p.id === permissionId ? {...p, isGranted: false} : p)
          );
          
          // Remove from group permissions
          setGroupPermissions(prev => prev.filter(p => p.id !== permissionId));
        } else {
          // Extract error message with fallbacks
          const errorMsg = 
            response?.message || 
            response?.data?.message || 
            response?.error || 
            response?.data?.error ||
            'Failed to revoke permission';
          
          setError(errorMsg);
        }
      } else {
        // Grant permission
        response = await permissionService.grantPermissionToGroup(groupId, permissionId);
        
        // Extract success status with fallbacks for different response formats
        const isSuccess = 
          response?.success === true || 
          response?.data?.success === true ||
          (response?.status && [200, 201, 204].includes(response.status));
        
        if (isSuccess) {
          setSuccess(`Permission successfully granted to "${groupName}" group`);
          
          // Update permissions state
          setPermissions(prevPermissions => 
            prevPermissions.map(p => p.id === permissionId ? {...p, isGranted: true} : p)
          );
          
          // Add to group permissions if not already there
          const permission = availablePermissions.find(p => p.id === permissionId);
          if (permission && !groupPermissions.some(p => p.id === permissionId)) {
            setGroupPermissions(prev => [...prev, {
              ...permission,
              granted_by_username: 'You', 
              granted_at: new Date().toISOString()
            }]);
          }
          
          // Refresh the group's permissions to get accurate data
          try {
            const refreshResponse = await permissionService.getGroupPermissions(groupId);
            
            let refreshedPermissions = [];
            
            // Try to extract permissions data from various response formats
            if (Array.isArray(refreshResponse)) {
              refreshedPermissions = refreshResponse;
            } else if (refreshResponse?.data && Array.isArray(refreshResponse.data)) {
              refreshedPermissions = refreshResponse.data;
            } else if (refreshResponse?.data?.data && Array.isArray(refreshResponse.data.data)) {
              refreshedPermissions = refreshResponse.data.data;
            } else if (refreshResponse?.permissions && Array.isArray(refreshResponse.permissions)) {
              refreshedPermissions = refreshResponse.permissions;
            } else if (refreshResponse?.data?.permissions && Array.isArray(refreshResponse.data.permissions)) {
              refreshedPermissions = refreshResponse.data.permissions;
            }
            
            if (refreshedPermissions.length > 0) {
              setGroupPermissions(refreshedPermissions);
            }
          } catch (refreshErr) {
            console.warn('Error refreshing permissions (non-fatal):', refreshErr);
          }
        } else {
          const errorMsg = 
            response?.message || 
            response?.data?.message || 
            response?.error || 
            response?.data?.error ||
            'Failed to grant permission';
          
          setError(errorMsg);
        }
      }
    } catch (err) {
      console.error('Error updating permission:', err);
      setError('Failed to update permission: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-primary overflow-hidden">
      {/* Header */}
      <div className="pb-5 border-b border-gray-200 dark:border-dark-border">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">
          Permissions for "{groupName}" Group
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Users in this group will inherit these administrative capabilities
        </p>
      </div>
      
      {/* Status messages */}
      {error && (
        <div className="mt-4 mb-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-700 p-4">
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
        <div className="mt-4 mb-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-700 p-4">
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
      
      {/* Permissions explanation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 mb-4 mt-4 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400 dark:text-dark-link" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-dark-text-primary">Role-Based Access Control</h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-dark-text-primary">
            </div>
          </div>
        </div>
      </div>
      
      {/* Permissions List */}
      <div className="mt-4">
        <ul className="divide-y divide-gray-200 dark:divide-dark-border">
          {permissions.map(permission => (
            <li key={permission.id} className={`px-4 py-4 ${permission.isGranted ? 'bg-blue-50 dark:bg-blue-900/20' : ''} hover:bg-gray-50 dark:hover:bg-dark-secondary`}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{permission.name}</h4>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{permission.description}</p>
                  {permission.isGranted && groupPermissions.find(p => p.id === permission.id) && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      Granted by {groupPermissions.find(p => p.id === permission.id).granted_by_username} 
                      {' on '}
                      {new Date(groupPermissions.find(p => p.id === permission.id).granted_at).toLocaleString()}
                    </p>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => togglePermission(permission.id, permission.isGranted)}
                    disabled={saving}
                    className={`px-3 py-1 rounded text-sm font-medium ${
                      permission.isGranted
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                        : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                    } ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {permission.isGranted ? 'Revoke' : 'Grant'}
                  </button>
                </div>
              </div>
            </li>
          ))}
          
          {permissions.length === 0 && (
            <li className="px-4 py-5 text-center text-gray-500 dark:text-gray-400">
              No permissions available.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

GroupPermissions.propTypes = {
  groupId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  groupName: PropTypes.string.isRequired
};

export default GroupPermissions;
