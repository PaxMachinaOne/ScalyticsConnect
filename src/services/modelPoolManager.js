// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { spawn } = require('child_process');
const path = require('path');
const { db } = require('../models/db');
const Model = require('../models/Model');
const eventBus = require('../utils/eventBus');
const gpuManager = require('./gpuManager');
const { readModelConfig, estimateVram } = require('../utils/vramCalculator');

class ModelPoolManager {
    constructor() {
        this.modelProcesses = {};
        this.portPool = this.initializePortPool(8010, 20);
    }

    initializePortPool(startPort, count) {
        const ports = new Set();
        for (let i = 0; i < count; i++) {
            ports.add(startPort + i);
        }
        return ports;
    }

    acquirePort() {
        if (this.portPool.size === 0) {
            return null;
        }
        const port = this.portPool.values().next().value;
        this.portPool.delete(port);
        return port;
    }

    releasePort(port) {
        if (port) {
            this.portPool.add(port);
        }
    }

    async initialize() {
        console.log('[ModelPoolManager] Initializing...');
        console.log('[ModelPoolManager] Initialization complete.');
    }

    async startModel(modelId, gpuId = 0, command, args = [], tensorParallelSize = 1, activationId = null) {
        const processKey = `${modelId}-${gpuId}`;
        if (this.modelProcesses[processKey]) {
            throw new Error(`Model ${modelId} is already running or starting on GPU ${gpuId}.`);
        }

        const model = await Model.findById(modelId);
        if (!model) {
            throw new Error(`Model with ID ${modelId} not found.`);
        }

        if (model.is_embedding_model) {
            console.log(`[ModelPoolManager] Model ${modelId} is an embedding model, bypassing VRAM check.`);
        } else {
            const modelConfig = readModelConfig(model.model_path);
        const totalEstimatedVram = estimateVram(modelConfig, 'fp16');
        const perGpuVramRequired = Math.ceil(totalEstimatedVram / tensorParallelSize);

        console.log(`[ModelPoolManager] VRAM Check for Model ${modelId} across ${tensorParallelSize} GPUs:`);
        console.log(`  - Total Estimated VRAM required: ${totalEstimatedVram} MiB`);
        console.log(`  - Per-GPU VRAM required: ${perGpuVramRequired} MiB`);

        const allGpuStats = gpuManager.getStats();
        if (!allGpuStats || allGpuStats.length === 0) {
            console.warn(`[ModelPoolManager] No NVIDIA GPUs detected via nvidia-smi. Bypassing VRAM check. vLLM will attempt to use the default available accelerator (e.g., Apple Metal).`);
        } else {
            for (let i = 0; i < tensorParallelSize; i++) {
                const currentGpuId = gpuId + i;
                const availableVram = gpuManager.getAvailableVram(currentGpuId);
                
                console.log(`  - Checking GPU ${currentGpuId}: Available VRAM is ${availableVram} MiB`);

                if (availableVram === null) {
                    throw new Error(`Could not retrieve VRAM information for GPU ${currentGpuId}, but other GPUs were detected.`);
                }
                if (perGpuVramRequired > availableVram) {
                    throw new Error(`Not enough VRAM on GPU ${currentGpuId} to load model ${modelId}. Required: ${perGpuVramRequired} MiB, Available: ${availableVram} MiB.`);
                }
            }
        }
        }
        const port = this.acquirePort();
        if (!port) {
            throw new Error('No available ports to start a new model process.');
        }

        console.log(`[ModelPoolManager] Starting model ${modelId} on GPU ${gpuId} on port ${port}`);
        
        const finalArgs = [...args, '--port', String(port)];

        const allGpuStats = gpuManager.getStats();
        const env = { ...process.env };
        if (allGpuStats && allGpuStats.length > 0) {
            const gpuIndices = Array.from({ length: tensorParallelSize }, (_, i) => gpuId + i);
            const cudaVisibleDevices = gpuIndices.join(',');
            env.CUDA_VISIBLE_DEVICES = cudaVisibleDevices;
            console.log(`[ModelPoolManager] Spawning process for model ${modelId} on NVIDIA GPUs [${cudaVisibleDevices}]...`);
        } else {
            console.log(`[ModelPoolManager] Spawning process for model ${modelId} on non-NVIDIA accelerator (e.g., Apple Metal)...`);
        }

        const modelProcess = spawn(command, finalArgs, {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: env,
        });

        const finalActivationId = activationId || `activation-${modelId}-${Date.now()}`;
        if (!activationId) {
            eventBus.publish('activation:start', finalActivationId, { modelId, modelName: model.name });
        }

        this.modelProcesses[processKey] = {
            modelId,
            gpuId,
            port,
            pid: modelProcess.pid,
            status: 'starting',
            process: modelProcess,
        };
        this._broadcastPoolUpdate();

        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

        const waitForReady = (port, timeout = 300000) => {
            const startTime = Date.now();
            const healthCheckUrl = `http://localhost:${port}/health`;

            const poll = async (resolve, reject) => {
                if (Date.now() - startTime > timeout) {
                    return reject(new Error(`Model server on port ${port} did not become ready within ${timeout / 1000}s.`));
                }

                try {
                    const response = await fetch(healthCheckUrl);
                    if (response.ok) {
                        console.log(`[ModelPoolManager] Model on port ${port} is ready.`);
                        return resolve();
                    }
                } catch (error) {
                }
                setTimeout(() => poll(resolve, reject), 2000);
            };
            return new Promise(poll);
        };

        waitForReady(port)
            .then(async () => {
                if (this.modelProcesses[processKey]) {
                    this.modelProcesses[processKey].status = 'ready';
                    this._broadcastPoolUpdate();
                    
                    await db.runAsync('UPDATE models SET is_active = 1, assigned_gpu_id = ? WHERE id = ?', [0, modelId]);
                    console.log(`[ModelPoolManager] Model ${modelId} marked as active in database.`);
                    
                    eventBus.publish('activation:complete', finalActivationId, { modelId, modelName: model.name });
                }
            })
            .catch(err => {
                console.error(`[ModelPoolManager] Error waiting for model ${modelId} to become ready:`, err);
                eventBus.publish('activation:error', finalActivationId, { modelId, modelName: model.name, error: err.message });
                if (this.modelProcesses[processKey]) {
                    this.modelProcesses[processKey].status = 'failed';
                    this.stopModel(modelId, gpuId);
                }
            });

        modelProcess.stdout.on('data', (data) => {
            const logLine = data.toString().trim();
            console.log(`[vLLM-stdout-${modelId}]: ${logLine}`);
            eventBus.publish('activation:debug', finalActivationId, { modelId, log: logLine });
        });

        modelProcess.stderr.on('data', (data) => {
            const logLine = data.toString().trim();
            console.error(`[vLLM-stderr-${modelId}]: ${logLine}`);
            eventBus.publish('activation:debug', finalActivationId, { modelId, log: logLine, isError: true });
        });

        modelProcess.on('exit', (code, signal) => {
            console.log(`[ModelPoolManager] Process for model ${modelId} (PID: ${modelProcess.pid}) exited with code ${code}, signal ${signal}.`);
            this.releasePort(port);
            delete this.modelProcesses[processKey];
            this._broadcastPoolUpdate();
        });
        
        modelProcess.on('error', (err) => {
            console.error(`[ModelPoolManager] Failed to start process for model ${modelId}:`, err);
            this.releasePort(port);
            delete this.modelProcesses[processKey];
        });

        return this.modelProcesses[processKey];
    }

    async stopModel(modelId, gpuId = 0) {
        const processKey = `${modelId}-${gpuId}`;
        const processInfo = this.modelProcesses[processKey];

        if (!processInfo || !processInfo.process) {
            console.warn(`[ModelPoolManager] No process found for model ${modelId} on GPU ${gpuId} to stop.`);
            if (processInfo) {
                this.releasePort(processInfo.port);
                delete this.modelProcesses[processKey];
            }
            return;
        }

        console.log(`[ModelPoolManager] Stopping model ${modelId} (PID: ${processInfo.pid}) on port ${processInfo.port}`);

        try {
            processInfo.process.kill('SIGTERM');
        } catch (e) {
            console.error(`[ModelPoolManager] Error sending SIGTERM to process ${processInfo.pid}:`, e);
            this.releasePort(processInfo.port);
            delete this.modelProcesses[processKey];
        }
    }

    getPoolState() {
        const sanitizedState = {};
        for (const key in this.modelProcesses) {
            const { process, ...rest } = this.modelProcesses[key];
            sanitizedState[key] = rest;
        }
        return sanitizedState;
    }

    _broadcastPoolUpdate() {
        eventBus.publish('pool:status_update', this.getPoolState());
    }

    getModelEndpoint(modelId, gpuId = 0) {
        const processKey = `${modelId}-${gpuId}`;
        const processInfo = this.modelProcesses[processKey];

        if (processInfo && processInfo.status === 'ready') {
            return {
                host: 'localhost',
                port: processInfo.port
            };
        }
        return null;
    }

    async shutdown() {
        console.log('[ModelPoolManager] Shutting down all model processes...');
        const shutdownPromises = Object.keys(this.modelProcesses).map(processKey => {
            const [modelId, gpuId] = processKey.split('-');
            return this.stopModel(modelId, parseInt(gpuId, 10));
        });
        await Promise.all(shutdownPromises);
        console.log('[ModelPoolManager] All model processes have been requested to stop.');
    }
}

const modelPoolManager = new ModelPoolManager();
module.exports = modelPoolManager;
