// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import adminService from '../../../services/adminService';

const GroupPicker = ({ selectedGroupId, onGroupSelect }) => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch available groups
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await adminService.getGroups();
        // Ensure groups is always an array
        if (response && response.data) {
          // Handle if response.data is an array
          if (Array.isArray(response.data)) {
            setGroups(response.data);
          } 
          // Handle if response.data.data is an array (nested data structure)
          else if (response.data.data && Array.isArray(response.data.data)) {
            setGroups(response.data.data);
          }
          // Handle if response.data.groups is an array
          else if (response.data.groups && Array.isArray(response.data.groups)) {
            setGroups(response.data.groups);
          }
          // Fallback to empty array if structure isn't recognized
          else {
            console.warn('Unexpected groups data format:', response.data);
            setGroups([]);
          }
        } else {
          // Fallback to empty array if no data
          setGroups([]);
        }
      } catch (err) {
        console.error('Error fetching groups:', err);
        setError('Failed to load groups');
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, []);

  return (
    <div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      
      <select
        value={selectedGroupId}
        onChange={(e) => onGroupSelect(e.target.value)}
        className={`
          mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 
          focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md
          bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        disabled={loading}
      >
        <option value="">Select a group</option>
        {groups.map(group => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      
      {loading && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Loading groups...</p>
      )}
    </div>
  );
};

GroupPicker.propTypes = {
  selectedGroupId: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number
  ]),
  onGroupSelect: PropTypes.func.isRequired
};

export default GroupPicker;
