// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import apiService from './apiService';

/**
 * Privacy service - handles privacy-related functions for all users
 */
const privacyService = {
  /**
   * Get privacy status - available to all authenticated users
   * @returns {Promise<Object>} Privacy status including global privacy mode setting
   */
  getPrivacyStatus: async () => {
    try {
      // Use the auth route for privacy status (accessible to all authenticated users)
      const response = await apiService.get('/auth/privacy-status');
      
      // Extract the privacy mode status, handling various response formats
      const isPrivacyModeEnabled = 
        (response?.data?.globalPrivacyMode === true) ||
        (response?.globalPrivacyMode === true) ||
        (response?.data?.data?.globalPrivacyMode === true);
      
      // Normalize the response format to match what the ModelSelector expects
      return {
        success: true,
        data: {
          globalPrivacyMode: isPrivacyModeEnabled
        },
        globalPrivacyMode: isPrivacyModeEnabled
      };
    } catch (error) {
      console.error('Error fetching privacy status:', error);
      // Return default values instead of throwing to prevent UI errors
      return {
        success: true,
        data: {
          globalPrivacyMode: false // Default to false if we can't determine
        },
        globalPrivacyMode: false
      };
    }
  },

  /**
   * Get privacy settings (alias for getPrivacyStatus for backwards compatibility)
   * @returns {Promise<Object>} Privacy settings including global privacy mode setting
   */
  getPrivacySettings: async () => {
    // Just call the standard privacy status endpoint
    try {
      return await privacyService.getPrivacyStatus();
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
      // Return default values instead of throwing to prevent UI errors
      return {
        success: true,
        data: {
          globalPrivacyMode: false // Default to false if we can't determine
        }
      };
    }
  }
};

export default privacyService;
