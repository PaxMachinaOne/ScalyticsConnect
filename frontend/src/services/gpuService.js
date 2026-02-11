// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * GPU Service
 * 
 * This service is responsible for fetching real-time GPU statistics from the
 * backend. It provides a simple interface for UI components to get the
 * latest hardware status.
 */
import apiService from './apiService';

const gpuService = {
  /**
   * Fetches the current statistics for all available GPUs.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of GPU stat objects.
   */
  async getGpuStats() {
    try {
      // This endpoint will need to be created on the backend.
      const response = await apiService.get('/admin/gpu/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching GPU stats:', error);
      // Return an empty array in case of an error to prevent UI crashes.
      return [];
    }
  },
};

export default gpuService;
