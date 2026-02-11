// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * GPU Controller (Admin)
 * 
 * This controller handles API requests related to GPU monitoring and management.
 * It provides an endpoint for administrators to fetch real-time statistics
 * about the system's GPU hardware.
 */
const gpuManager = require('../../services/gpuManager');

const gpuController = {
  /**
   * GET /admin/gpu/stats
   * 
   * Retrieves the latest statistics for all available GPUs.
   */
  async getGpuStats(req, res) {
    try {
      const stats = gpuManager.getStats();
      if (!stats) {
        return res.status(404).json({ message: 'GPU statistics are not available.' });
      }
      res.status(200).json(stats);
    } catch (error) {
      console.error('[GpuController] Error fetching GPU stats:', error);
      res.status(500).json({ message: 'An error occurred while fetching GPU statistics.' });
    }
  },
};

module.exports = gpuController;
