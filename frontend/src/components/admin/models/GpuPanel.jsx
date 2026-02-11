/**
 * GPU Panel
 * 
 * This component displays a real-time overview of the system's GPU resources.
 * It visualizes each GPU's VRAM usage, temperature, and lists the models
 * currently running on it.
 */
import React from 'react';

const GpuPanel = ({ gpuStats, models }) => {
  if (!gpuStats || gpuStats.length === 0) {
    return (
      <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
        <p className="text-gray-600 dark:text-gray-400">No GPU information available. Ensure NVIDIA drivers and nvidia-smi are installed on the server.</p>
      </div>
    );
  }

  return (
    <div className="mb-6 p-4 bg-white dark:bg-dark-primary shadow rounded-lg">
      <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-4">GPU Status</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {gpuStats.map((gpu) => {
          const modelsOnGpu = models.filter(m => m.is_active && m.assigned_gpu_id === gpu.id);
          const usagePercent = gpu.memory.total > 0 ? (gpu.memory.used / gpu.memory.total) * 100 : 0;

          return (
            <div key={gpu.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">GPU {gpu.id}: {gpu.name}</h4>
                <span className="text-sm text-gray-500 dark:text-gray-400">{gpu.temperature}°C</span>
              </div>
              
              {/* VRAM Usage Bar */}
              <div>
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
                  <span>VRAM: {gpu.memory.used} / {gpu.memory.total} MiB</span>
                  <span>{usagePercent.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${usagePercent}%` }}
                  ></div>
                </div>
              </div>

              {/* Models on this GPU */}
              <div className="mt-4">
                <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">Active Models:</h5>
                <ul className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {modelsOnGpu.length > 0 ? (
                    modelsOnGpu.map(model => (
                      <li key={model.id}>- {model.name}</li>
                    ))
                  ) : (
                    <li>No active models on this GPU.</li>
                  )}
                </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GpuPanel;
