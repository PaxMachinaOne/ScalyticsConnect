// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * GPU Manager
 * 
 * This service is responsible for monitoring the status of available NVIDIA GPUs
 * on the system. It uses nvidia-smi to fetch real-time data such as VRAM usage,
 * temperature, and power draw. This information is crucial for the Model Pool Manager
 * to make informed decisions about model placement.
 */
const { exec } = require('child_process');
const util = require('util');
const { db } = require('../models/db');
const execAsync = util.promisify(exec);

class GpuManager {
    constructor() {
        this.gpuStats = [];
        this.isFetching = false;
        this.lastUpdated = null;
        this.updateInterval = 5000; 
        this.intervalId = null;
    }

    /**
     * Starts the periodic fetching of GPU statistics.
     */
    start() {
        if (this.intervalId) {
            return;
        }
        console.log('[GpuManager] Starting GPU stats polling.');
        this.fetchGpuStats(); 
        this.intervalId = setInterval(() => this.fetchGpuStats(), this.updateInterval);
    }

    /**
     * Stops the periodic fetching of GPU statistics.
     */
    stop() {
        if (this.intervalId) {
            console.log('[GpuManager] Stopping GPU stats polling.');
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Fetches and parses GPU statistics from nvidia-smi.
     */
    async fetchGpuStats() {
        if (this.isFetching) {
            return;
        }
        this.isFetching = true;

        try {
            const command = 'nvidia-smi --query-gpu=index,uuid,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw --format=csv,noheader,nounits';
            const { stdout } = await execAsync(command);
            
            const lines = stdout.trim().split('\n');
            const stats = lines.map(line => {
                const [index, uuid, name, memoryTotal, memoryUsed, memoryFree, utilizationGpu, temperatureGpu, powerDraw] = line.split(', ');
                return {
                    id: parseInt(index, 10),
                    uuid,
                    name,
                    memory: {
                        total: parseInt(memoryTotal, 10),
                        used: parseInt(memoryUsed, 10),
                        free: parseInt(memoryFree, 10),
                    },
                    utilization: parseFloat(utilizationGpu),
                    temperature: parseFloat(temperatureGpu),
                    powerDraw: parseFloat(powerDraw),
                    loadedModels: [], 
                };
            });

            const activeModels = await db.allAsync(
                'SELECT id, name, assigned_gpu_id, tensor_parallel_size FROM models WHERE is_active = 1 AND assigned_gpu_id IS NOT NULL'
            );

            if (activeModels) {
                activeModels.forEach(model => {
                    const startGpu = model.assigned_gpu_id;
                    const numGpus = model.tensor_parallel_size || 1;
                    for (let i = 0; i < numGpus; i++) {
                        const gpuId = startGpu + i;
                        const gpuStat = stats.find(s => s.id === gpuId);
                        if (gpuStat) {
                            gpuStat.loadedModels.push({ id: model.id, name: model.name });
                        }
                    }
                });
            }

            this.gpuStats = stats;
            this.lastUpdated = new Date();
        } catch (error) {
            console.error('[GpuManager] Failed to fetch GPU stats:', error.message);
            this.gpuStats = [];
        } finally {
            this.isFetching = false;
        }
    }

    /**
     * Returns the latest fetched GPU statistics.
     * @returns {Array<object>} An array of GPU stat objects.
     */
    getStats() {
        return this.gpuStats;
    }

    /**
     * Gets the available VRAM for a specific GPU.
     * @param {number} gpuId - The ID of the GPU.
     * @returns {number|null} The available VRAM in MiB, or null if not found.
     */
    getAvailableVram(gpuId) {
        const gpu = this.gpuStats.find(g => g.id === gpuId);
        return gpu ? gpu.memory.free : null;
    }
}

const gpuManager = new GpuManager();
gpuManager.start();

module.exports = gpuManager;
