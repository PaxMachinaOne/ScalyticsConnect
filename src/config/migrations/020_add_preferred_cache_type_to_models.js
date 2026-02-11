// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration: Add preferred_cache_type and model parameters columns to models table.
 * This migration adds columns needed for model parameter configuration:
 * - preferred_cache_type: for controlling KV cache preference
 * - n_gpu_layers: for controlling how many model layers are offloaded to GPU
 * - n_batch: for controlling batch size during inference
 * - n_ctx: for controlling context window size
 */
const { db } = require('../../models/db'); 

const MIGRATION_NAME = '020_add_preferred_cache_type_to_models';

async function columnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
      if (err) {
        return reject(new Error(`Error fetching table info for ${tableName}: ${err.message}`));
      }
      const exists = columns.some(col => col.name === columnName);
      resolve(exists);
    });
  });
}

async function addColumn(tableName, columnName, columnType) {
  const exists = await columnExists(tableName, columnName);
  
  if (!exists) {
    console.log(`[Migration] Column '${columnName}' does not exist in '${tableName}'. Adding...`);
    await new Promise((resolve, reject) => {
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`, (err) => {
        if (err) {
          return reject(new Error(`Failed to add column '${columnName}': ${err.message}`));
        }
        console.log(`[Migration] Column '${columnName}' added successfully.`);
        resolve();
      });
    });
  } else {
    console.log(`[Migration] Column '${columnName}' already exists in '${tableName}'. Skipping.`);
  }
}

async function runMigration() {
  console.log(`[Migration] Running: ${MIGRATION_NAME}`);
  try {
    await addColumn('models', 'preferred_cache_type', 'TEXT');
    
    await addColumn('models', 'n_gpu_layers', 'INTEGER');
    await addColumn('models', 'n_batch', 'INTEGER');
    await addColumn('models', 'n_ctx', 'INTEGER');
    
    await addColumn('models', 'gpu_assignment', 'TEXT');

    console.log(`[Migration] Completed: ${MIGRATION_NAME}`);
  } catch (error) {
    console.error(`[Migration] FAILED: ${MIGRATION_NAME}: ${error.message}`);
    throw error; 
  }
}

module.exports = {
  runMigration,
  MIGRATION_NAME 
};
