// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Utility functions for model management
 */
const path = require('path');
const fs = require('fs').promises;
const { spawn, execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);

/**
 * Determine model type based on file extension or directory contents
 * @param {string} modelPath - Path to model file or directory
 * @returns {Promise<Object>} - Model type information
 */
async function detectModelType(modelPath) {
  try {
    const stats = await fs.stat(modelPath);
    
    if (stats.isDirectory()) {
      // For directories, check the contents
      return await detectModelTypeFromDirectory(modelPath);
    } else {
      // For files, check the extension
      return detectModelTypeFromFile(modelPath);
    }
  } catch (error) {
    console.error('Error detecting model type: %s', error.message);
    return {
      type: 'unknown',
      requiredLibraries: ['transformers', 'torch', 'accelerate'], // vLLM dependencies
      format: 'unknown'
    };
  }
}

/**
 * Detect model type from a file path
 * @param {string} filePath - Path to the model file
 * @returns {Object} - Model type information
 */
function detectModelTypeFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  // Hugging Face format files (for vLLM)
  if (ext === '.safetensors' || ext === '.bin' || ext === '.pt' || ext === '.pth') {
    return {
      type: 'huggingface',
      requiredLibraries: ['transformers', 'torch', 'accelerate'],
      format: ext.slice(1) // Remove the dot
    };
  }
  
  // ONNX format files
  if (ext === '.onnx') {
    return {
      type: 'onnx',
      requiredLibraries: ['onnxruntime', 'transformers'],
      format: 'onnx'
    };
  }
  
  // TensorFlow/TFLite files
  if (ext === '.pb' || ext === '.tflite') {
    return {
      type: 'tensorflow',
      requiredLibraries: ['tensorflow'],
      format: ext.slice(1) // Remove the dot
    };
  }
  
  // Default to returning an unknown type
  return {
    type: 'unknown',
    requiredLibraries: ['transformers', 'torch', 'accelerate'], // vLLM dependencies
    format: ext.slice(1) || 'unknown'
  };
}

/**
 * Detect model type from a directory
 * @param {string} dirPath - Path to the model directory
 * @returns {Promise<Object>} - Model type information
 */
async function detectModelTypeFromDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    
    // Check for config.json or similar files to identify Hugging Face models
    if (files.includes('config.json') || files.includes('pytorch_model.bin') || 
        files.includes('model.safetensors') || files.some(f => f.endsWith('.safetensors'))) {
      return {
        type: 'huggingface',
        requiredLibraries: ['transformers', 'torch', 'accelerate'],
        format: 'huggingface'
      };
    }
    
    // Check for ONNX files
    if (files.some(f => f.endsWith('.onnx'))) {
      return {
        type: 'onnx',
        requiredLibraries: ['onnxruntime', 'transformers'],
        format: 'onnx'
      };
    }
    
    // Default fallback - install common libraries
    return {
      type: 'unknown',
      requiredLibraries: ['transformers', 'torch', 'accelerate'],
      format: 'unknown'
    };
  } catch (error) {
    console.error('Error detecting model type from directory: %s', error.message);
    return {
      type: 'unknown',
      requiredLibraries: ['transformers', 'torch', 'accelerate'],
      format: 'unknown'
    };
  }
}

/**
 * Install required libraries for a model
 * @param {Object} modelInfo - Model type information
 * @returns {Promise<boolean>} - True if successful
 */
async function installModelDependencies(modelInfo) {
  try {
    const scriptsDir = path.join(process.cwd(), 'scripts');
    const setupScript = path.join(scriptsDir, 'setup_local_models.sh');
    
    // Check if the script exists
    try {
      await fs.access(setupScript);
    } catch (err) {
      console.error('Setup script not found at: %s', setupScript);
      return false;
    }
    
    console.log('Running setup script for model type: %s (%s)', modelInfo.type, modelInfo.format);
    console.log('Required libraries: %s', modelInfo.requiredLibraries.join(', '));
    
    // Make the script executable
    await execFilePromise('chmod', ['+x', setupScript]);
    
    // Run the setup script
    return new Promise((resolve, reject) => {
      const process = spawn(setupScript, [], { 
        stdio: 'inherit',
        shell: true
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log('Setup script completed successfully');
          resolve(true);
        } else {
          console.error('Setup script failed with code %s', code);
          resolve(false); // Resolve with false instead of rejecting
        }
      });
      
      process.on('error', (err) => {
        console.error('Error running setup script: %s', err.message);
        resolve(false);
      });
    });
  } catch (error) {
    console.error('Error installing model dependencies: %s', error.message);
    return false;
  }
}

module.exports = {
  detectModelType,
  installModelDependencies
};
