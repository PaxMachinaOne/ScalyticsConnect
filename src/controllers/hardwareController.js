// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const dataDir = path.join(__dirname, '../../data/hardware');

(async () => {
  try {
    await fsPromises.mkdir(dataDir, { recursive: true });
  } catch (error) {
  }
})();

const historicalData = {
  cpu: [],
  memory: [],
  gpu: []
};

const MAX_HISTORY_LENGTH = 8640;

const dataFiles = {
  cpu: path.join(dataDir, 'cpu_history.json'),
  memory: path.join(dataDir, 'memory_history.json'),
  gpu: path.join(dataDir, 'gpu_history.json')
};

const COLLECTION_INTERVAL = 10 * 1000;
const SAVE_INTERVAL = 5 * 60 * 1000;

const ensureDataDirExists = async () => {
  try {
    await fsPromises.mkdir(dataDir, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
};

const saveHistoricalData = async () => {
  try {
    const dirExists = await ensureDataDirExists();
    if (!dirExists) {
      return false;
    }
    
     for (const type of Object.keys(historicalData)) {
       const filePath = dataFiles[type];
       const currentData = historicalData[type];
       if (currentData && currentData.length > 0) {
         try {
           const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

           const dataToSave = currentData.filter(entry => {
             if (!entry || !entry.time) return false;
             try {
               return new Date(entry.time).getTime() >= twentyFourHoursAgo;
             } catch (e) {
               console.warn(`[HardwareCtrl] Discarding invalid date entry in ${type}_history.json:`, entry.time);
               return false;
             }
           });

           await fsPromises.writeFile(
             filePath,
             JSON.stringify(dataToSave, null, 2)
           );
         } catch (err) {
        }
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

const loadHistoricalData = async () => {
  try {
    const dirExists = await ensureDataDirExists();
    if (!dirExists) {
      return false;
    }
    
    let dataLoaded = false;
    
    for (const type of Object.keys(historicalData)) {
      const filePath = dataFiles[type];
      try {
        const data = await fsPromises.readFile(filePath, 'utf8');
        const parsedData = JSON.parse(data);
        
        if (Array.isArray(parsedData)) {
          historicalData[type] = parsedData;
          dataLoaded = true;
        }
      } catch (err) {
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

const addHistoricalDataPoint = (type, dataPoint) => {
  historicalData[type].push({
    ...dataPoint,
    time: new Date().toISOString()
  });
  
  if (historicalData[type].length > MAX_HISTORY_LENGTH) {
    historicalData[type].shift();
  }
};

const initializeHistoricalData = () => {
  historicalData.cpu = [];
  historicalData.memory = [];
  historicalData.gpu = [];
  
  const now = Date.now();
  for (let i = 0; i < 24; i++) {
    historicalData.cpu.push({
      time: new Date(now - i * 60000).toISOString(),
      usagePercent: 0
    });
    
    historicalData.memory.push({
      time: new Date(now - i * 60000).toISOString(),
      usagePercent: 0,
      usedPercent: 0
    });
    
    historicalData.gpu.push({
      time: new Date(now - i * 60000).toISOString(),
      usagePercent: 0
    });
  }
  
  historicalData.cpu.reverse();
  historicalData.memory.reverse();
  historicalData.gpu.reverse();
};

const setupEnvironment = async () => {
  const loaded = await loadHistoricalData();
  
  if (!loaded || historicalData.cpu.length === 0) {
    initializeHistoricalData();
    
    await saveHistoricalData();
  }
  
  try {
    const cpuUsage = await calculateCpuUsage();
    const memoryInfo = getMemoryInfo();
    
    addHistoricalDataPoint('cpu', { usagePercent: cpuUsage.total });
    addHistoricalDataPoint('memory', { 
      usedPercent: memoryInfo.percentUsed,
      usagePercent: memoryInfo.percentUsed
    });
    
    await saveHistoricalData();
  } catch (err) {
  }
  
  const saveInterval = setInterval(saveHistoricalData, SAVE_INTERVAL);
  
  const collectionInterval = setInterval(async () => {
    try {
      const [cpuUsage, memoryInfo, gpuInfo] = await Promise.all([
        calculateCpuUsage(),
        getMemoryInfo(),
        getGpuInfo()
      ]);
      
      addHistoricalDataPoint('cpu', { usagePercent: cpuUsage.total });
      
      addHistoricalDataPoint('memory', { 
        usedPercent: memoryInfo.percentUsed,
        usagePercent: memoryInfo.percentUsed
      });
      
      if (gpuInfo.devices.length > 0) {
        const totalUtilization = gpuInfo.devices.reduce((sum, device) => 
          sum + (device.utilization || 0), 0);
        const avgUtilization = gpuInfo.devices.length > 0 ? 
          totalUtilization / gpuInfo.devices.length : 0;
        
        addHistoricalDataPoint('gpu', { usagePercent: avgUtilization });
      } else {
        addHistoricalDataPoint('gpu', { usagePercent: 0 });
      }
    } catch (error) {
      console.error('Error collecting hardware metrics:', error);
    }
  }, COLLECTION_INTERVAL);
  
  process.on('SIGTERM', async () => {
    await saveHistoricalData();
    clearInterval(saveInterval);
    clearInterval(collectionInterval);
  });
  
  process.on('SIGINT', async () => {
    await saveHistoricalData();
    clearInterval(saveInterval);
    clearInterval(collectionInterval);
  });
};

setupEnvironment().catch(() => {
});

const getDetailedCpuInfo = async () => {
  try {
    const cpuInfoBasic = {
      model: os.cpus()[0].model,
      cores: os.cpus().length,
      speed: os.cpus()[0].speed || 0, // Default speed from os module
      loadAvg: os.loadavg(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime()
    };
    
    cpuInfoBasic.cores = os.cpus().length;
    cpuInfoBasic.coreInfo = os.cpus().map((core, index) => ({
      id: index,
      model: core.model,
      speed: core.speed,
      times: core.times
    }));
    
    return cpuInfoBasic;
  } catch (error) {
    return {
      model: os.cpus()[0].model,
      cores: os.cpus().length,
      speed: os.cpus()[0].speed,
      loadAvg: os.loadavg()
    };
  }
};

const calculateCpuUsage = async () => {
  try {
    const startMeasure = os.cpus();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const endMeasure = os.cpus();
    
    const cpuUsage = startMeasure.map((startCore, index) => {
      const endCore = endMeasure[index];
      
      const startTotal = Object.values(startCore.times).reduce((a, b) => a + b, 0);
      const endTotal = Object.values(endCore.times).reduce((a, b) => a + b, 0);
      
      const startIdle = startCore.times.idle;
      const endIdle = endCore.times.idle;
      
      const totalDiff = endTotal - startTotal;
      const idleDiff = endIdle - startIdle;
      
      const usagePercent = 100 - (idleDiff / totalDiff * 100);
      
      return {
        core: index,
        usage: usagePercent
      };
    });
    
    const totalUsage = Math.min(100, cpuUsage.reduce((sum, core) => sum + core.usage, 0) / cpuUsage.length);
    
    return {
      total: totalUsage,
      perCore: cpuUsage
    };
  } catch (error) {
    const cpuUsage = process.cpuUsage();
    return {
      user: cpuUsage.user / 1000000,
      system: cpuUsage.system / 1000000,
      total: (cpuUsage.user + cpuUsage.system) / 1000000
    };
  }
};

const getMemoryInfo = async () => {
  const totalMemory = os.totalmem();
  let usedMemory;

  if (os.platform() === 'darwin') {
    try {
      const { stdout } = await execPromise('vm_stat', { timeout: 5000 });
      const lines = stdout.split('\n').map(line => line.trim()).filter(Boolean);
      
      let pageSize = 4096;
      const headerLine = lines.find(line => line.toLowerCase().includes('page size of'));
      if (headerLine) {
        const pageSizeMatch = headerLine.match(/page size of (\d+)/i);
        if (pageSizeMatch) {
          pageSize = parseInt(pageSizeMatch[1], 10);
        }
      }
      
      let pagesFree = 0;
      let pagesInactive = 0;
      
      for (const line of lines) {
        const freeMatch = line.match(/^Pages free:\s*(\d+)\.?/i);
        if (freeMatch) {
          pagesFree = parseInt(freeMatch[1], 10);
          continue;
        }
        
        const inactiveMatch = line.match(/^Pages inactive:\s*(\d+)\.?/i);
        if (inactiveMatch) {
          pagesInactive = parseInt(inactiveMatch[1], 10);
          continue;
        }
      }

      if (pagesFree >= 0 && pagesInactive >= 0) {
        const freeMemory = (pagesFree + pagesInactive) * pageSize;
        usedMemory = totalMemory - freeMemory;
        
        if (usedMemory < 0 || usedMemory > totalMemory) {
          console.warn(`[HardwareCtrl] Calculated memory values seem incorrect: used=${Math.round(usedMemory/1024/1024)}MB, total=${Math.round(totalMemory/1024/1024)}MB, falling back to os.freemem()`);
          throw new Error(`Invalid calculated memory values`);
        }
      } else {
        throw new Error('Could not find valid page counts in vm_stat output.');
      }

    } catch (e) {
      console.warn(`[HardwareCtrl] vm_stat parsing failed on macOS (${e.message}), falling back to os.freemem()`);
      usedMemory = totalMemory - os.freemem();
    }
  } else {
    usedMemory = totalMemory - os.freemem();
  }

  const freeMemory = totalMemory - usedMemory;
  const percentUsed = Math.max(0, Math.min(100, (usedMemory / totalMemory) * 100));
  
  return {
    total: totalMemory,
    free: freeMemory,
    used: usedMemory,
    percentUsed: percentUsed
  };
};

const getGpuInfo = async (memoryInfo) => {
  try {
    let devices = [];
    let appleGpuDetected = false;
    
    const isMacOS = os.platform() === 'darwin';
    
    if (isMacOS) {
      try {
        const { stdout } = await execPromise('system_profiler SPDisplaysDataType', { timeout: 5000 });
        
        if (stdout && stdout.includes('Apple') && (
            stdout.includes('M1') || 
            stdout.includes('M2') || 
            stdout.includes('M3') || 
            stdout.includes('Apple GPU')
        )) {
          let gpuName = 'Apple GPU';
          const gpuMatch = stdout.match(/Chipset Model:\s*(Apple M\d\w*|Apple GPU)/i);
          if (gpuMatch && gpuMatch[1]) {
            gpuName = gpuMatch[1];
          }
          
          const memInfo = memoryInfo || await getMemoryInfo();
          devices.push({
            id: '0',
            type: 'Apple',
            name: gpuName,
            utilization: 0,
            memory: {
              used: memInfo.used / (1024 * 1024),
              total: memInfo.total / (1024 * 1024)
            }
          });
          appleGpuDetected = true;
          
          try {
            const cpuUsage = await calculateCpuUsage();
            if (devices[0] && cpuUsage.total) {
              devices[0].utilization = Math.min(100, cpuUsage.total * 0.8);
            }
          } catch (e) {
          }
        }
      } catch (error) {
      }
    }
    
    if (!appleGpuDetected) {
      const hasNvidiaSmi = await (async () => {
        try {
          await execPromise('which nvidia-smi 2>/dev/null', { timeout: 2000 });
          return true;
        } catch (error) {
          return false;
        }
      })();
      
      if (hasNvidiaSmi) {
        try {
          const { stdout } = await execPromise(
            'nvidia-smi --query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null', 
            { timeout: 5000 }
          );
          
          if (stdout && stdout.trim()) {
            const gpuEntries = [];
            
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              const [index, name, temperature, utilization, memoryUsed, memoryTotal] = line.split(',').map(s => s.trim());
              
              let cleanName = name;
              if (name && name.includes('NVIDIA')) {
                cleanName = name.replace(/\s+(NVIDIA|AMD|Intel)\s*$/i, '');
              }
              
              gpuEntries.push({
                id: index,
                type: 'NVIDIA',
                name: cleanName || `GPU ${index}`,
                temperature: parseInt(temperature) || 0,
                utilization: parseInt(utilization) || 0,
                memory: {
                  used: parseInt(memoryUsed) || 0,
                  total: parseInt(memoryTotal) || 0
                }
              });
            }
            
            devices = gpuEntries; 
          }
        } catch (error) {
        }
      }
    }
    
    let cudaVersion = null;
    if (!appleGpuDetected) {
      try {
        const { stdout: smiOutput } = await execPromise('nvidia-smi', { timeout: 3000 });
        const cudaMatch = smiOutput.match(/CUDA Version:\s+(\d+\.\d+)/i);
        if (cudaMatch && cudaMatch[1]) {
          cudaVersion = cudaMatch[1];
        }
      } catch (e) {
      }
    }
    
    const software = {
      cuda: cudaVersion
    };
    
    return {
      devices,
      software,
      history: historicalData.gpu
    };
  } catch (error) {
    return {
      devices: [],
      software: {},
      history: []
    };
  }
};

const ensureDataPointFormat = (dataPoints) => {
  if (!Array.isArray(dataPoints)) return [];
  
  return dataPoints.map(point => {
    if (point.usagePercent === undefined && point.usedPercent !== undefined) {
      return {
        ...point,
        usagePercent: point.usedPercent
      };
    }
    return point;
  });
};

const vllmService = require('../services/vllmService');
const modelPoolManager = require('../services/modelPoolManager');
const Model = require('../models/Model');

const getHardwareInfo = async (req, res) => {
  try {
    const memoryInfoResult = await getMemoryInfo();

    const [cpuInfoResult, cpuUsageResult, gpuInfoResult, effectiveVramLimitGbResult] = await Promise.all([
      getDetailedCpuInfo(),
      calculateCpuUsage(),
      getGpuInfo(memoryInfoResult),
      getEffectiveGpuVramLimitGb()
    ]);

    const poolState = modelPoolManager.getPoolState();
    const gpuToModelMap = {};
    const modelIdToName = {};

    const activeProcesses = Object.values(poolState).filter(p => p.status === 'ready');

    for (const process of activeProcesses) {
      if (!modelIdToName[process.modelId]) {
        const model = await Model.findById(process.modelId);
        if (model) {
          modelIdToName[process.modelId] = model.name;
        }
      }
    }

    for (const process of activeProcesses) {
      if (modelIdToName[process.modelId]) {
        gpuToModelMap[process.gpuId] = modelIdToName[process.modelId];
      }
    }

    const augmentedGpuDevices = gpuInfoResult.devices.map(device => {
      const assignedModel = gpuToModelMap[device.id] || 'Idle';
      return {
        ...device,
        assignedModel: assignedModel,
      };
    });

    addHistoricalDataPoint('cpu', { usagePercent: cpuUsageResult.total });
    
    addHistoricalDataPoint('memory', {
      usedPercent: memoryInfoResult.percentUsed,
      usagePercent: memoryInfoResult.percentUsed
    });

    historicalData.memory = ensureDataPointFormat(historicalData.memory);

    if (gpuInfoResult.devices.length > 0) {
      const totalUtilization = gpuInfoResult.devices.reduce((sum, device) =>
        sum + (device.utilization || 0), 0);
      const avgUtilization = gpuInfoResult.devices.length > 0 ?
        totalUtilization / gpuInfoResult.devices.length : 0;

      addHistoricalDataPoint('gpu', { usagePercent: avgUtilization });
    } else {
      addHistoricalDataPoint('gpu', { usagePercent: 0 });
    }
    
    const hardwareInfo = {
      cpu: {
        ...cpuInfoResult,
        usage: cpuUsageResult,
        history: historicalData.cpu
      },
      memory: {
        ...memoryInfoResult,
        history: ensureDataPointFormat(historicalData.memory)
      },
      gpu: {
        ...gpuInfoResult,
        devices: augmentedGpuDevices,
        history: historicalData.gpu
      },
      system: {
        platform: os.platform(),
        release: os.release(),
        type: os.type(),
        arch: os.arch(),
        uptime: os.uptime(),
        hostname: os.hostname()
      },
      poolStatus: modelPoolManager.getPoolState(),
      effectiveVramLimitGb: effectiveVramLimitGbResult
    };

    res.json(hardwareInfo);
  } catch (error) {
    console.error('[HardwareCtrl] FATAL ERROR in getHardwareInfo:', error.message); 
    console.error('[HardwareCtrl] Stack Trace:', error.stack || 'No stack trace available');
    if (error.code) console.error('[HardwareCtrl] Error Code:', error.code);
    if (error.syscall) console.error('[HardwareCtrl] Syscall:', error.syscall);
    
    res.status(500).json({ 
      error: 'Failed to retrieve hardware information', 
    });
  }
};

const getHardwareHistory = (req, res) => {
  res.json(historicalData);
};

const refreshGpuInfo = async (req, res) => {
  try {
    // Get fresh GPU info
    const gpuInfo = await getGpuInfo();
    
    res.json(gpuInfo);
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh GPU information' });
  }
};

const getGpuIndices = async () => {
  try {
    const { stdout } = await execPromise(
      'nvidia-smi --query-gpu=index --format=csv,noheader,nounits',
      { timeout: 3000 }
    );
    
    if (stdout && stdout.trim()) {
      const indices = stdout.trim().split('\n').map(s => s.trim()).filter(Boolean);
      if (indices.length > 0) {
        console.log(`[HardwareCtrl] Detected NVIDIA GPU indices via query: ${indices.join(', ')}`);
        return indices;
      }
    }
  } catch (error) {
    console.log(`[HardwareCtrl] nvidia-smi query failed. Checking for other GPU types.`);
  }

  if (os.platform() === 'darwin') {
     try {
       const { stdout: sysProfiler } = await execPromise('system_profiler SPDisplaysDataType', { timeout: 5000 });
       if (sysProfiler && (sysProfiler.includes('Apple M1') || sysProfiler.includes('Apple M2') || sysProfiler.includes('Apple M3') || sysProfiler.includes('Apple GPU'))) {
           console.log('[HardwareCtrl] Detected Apple Silicon GPU.');
           return ['0'];
       }
     } catch (macError) {
       console.warn(`[HardwareCtrl] Failed to detect Apple Silicon GPU via system_profiler: ${macError.message}`);
     }
  }
  
  console.warn('[HardwareCtrl] No compatible GPUs detected. Local model inference will not be available.');
  return []; 
};

let cachedEffectiveVramLimitGb = null;
const VRAM_SAFETY_MARGIN_GB = 2;

const getEffectiveGpuVramLimitGb = async () => {
  if (cachedEffectiveVramLimitGb !== null) {
    return cachedEffectiveVramLimitGb;
  }

  try {
    const gpuInfo = await getGpuInfo(); // Reuse existing detection logic

    // Find the primary GPU (index '0' or the first one found)
    const primaryGpu = gpuInfo.devices?.find(d => d.id === '0') || gpuInfo.devices?.[0];

    let totalAvailableGb = 0;
    let calculationSource = "Unknown";

    if (primaryGpu?.type === 'Apple') {
      calculationSource = "Apple Silicon (75% System RAM)";
      const totalSystemMemBytes = os.totalmem();
      const estimatedAvailableBytes = totalSystemMemBytes * 0.75;
      totalAvailableGb = estimatedAvailableBytes / (1024 * 1024 * 1024);
    } else if (primaryGpu?.memory && typeof primaryGpu.memory.total === 'number') {
      calculationSource = "Dedicated GPU VRAM";
      const totalVramMib = primaryGpu.memory.total;
      totalAvailableGb = totalVramMib / 1024;
    } else {
      console.warn('[HardwareCtrl] Could not determine VRAM for primary GPU. Defaulting VRAM limit to 0 GB.');
      cachedEffectiveVramLimitGb = 0;
      return 0;
    }

    let effectiveLimitGb = 0;
    if (totalAvailableGb <= VRAM_SAFETY_MARGIN_GB) {
       console.warn(`[HardwareCtrl] Source: ${calculationSource}. Available memory (${totalAvailableGb.toFixed(1)} GB) is less than or equal to safety margin (${VRAM_SAFETY_MARGIN_GB} GB). Setting effective limit to 0 GB.`);
       effectiveLimitGb = 0;
    } else {
       effectiveLimitGb = totalAvailableGb - VRAM_SAFETY_MARGIN_GB;
    }

    cachedEffectiveVramLimitGb = Math.max(0, effectiveLimitGb); 
    return cachedEffectiveVramLimitGb;

  } catch (error) {
    console.error(`[HardwareCtrl] Error getting effective VRAM limit: ${error.message}. Defaulting to 0 GB.`);
    cachedEffectiveVramLimitGb = 0;
    return 0;
  }
};

module.exports = {
  getHardwareInfo,
  getHardwareHistory,
  refreshGpuInfo,
  getDetailedCpuInfo,
  calculateCpuUsage,
  getMemoryInfo,
  getGpuInfo,
  saveHistoricalData,
  getGpuIndices,
  getEffectiveGpuVramLimitGb
};
