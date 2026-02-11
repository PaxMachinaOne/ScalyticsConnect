// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db');

// Helper to add a column if it doesn't exist
const addColumnIfNotExists = async (tableName, columnName, columnDefinition) => {
  try {
    const rows = await db.allAsync(`PRAGMA table_info(${tableName})`);
    const columnExists = rows.some(row => row.name === columnName);
    if (!columnExists) {
      await db.runAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
      console.log(`[Migration] Added '${columnName}' to '${tableName}' table.`);
    } else {
      console.log(`[Migration] Column '${columnName}' already exists in '${tableName}'.`);
    }
  } catch (error) {
    console.error(`[Migration] Error adding column '${columnName}' to '${tableName}':`, error);
    throw error;
  }
};

const up = async () => {
  console.log('[Migration] Applying 038: Add vLLM and multi-modal support fields to models table...');
  
  // Wrap in a transaction to ensure all or nothing
  await db.runAsync('BEGIN TRANSACTION;');
  try {
    // Add model_type to classify the model's function
    await addColumnIfNotExists('models', 'model_type', "TEXT DEFAULT 'text_generation' NOT NULL");

    // Add tensor_parallel_size for vLLM
    await addColumnIfNotExists('models', 'tensor_parallel_size', 'INTEGER DEFAULT 1');

    // Add model_format to distinguish between gguf and torch/safetensors
    await addColumnIfNotExists('models', 'model_format', "TEXT DEFAULT 'torch'");

    // Add quantization_method for vLLM
    await addColumnIfNotExists('models', 'quantization_method', 'TEXT');

    await db.runAsync('COMMIT;');
    console.log('[Migration] 038 applied successfully.');
  } catch (error) {
    await db.runAsync('ROLLBACK;');
    console.error('[Migration] Failed to apply 038:', error);
    throw error;
  }
};

const down = async () => {
  // This migration is not easily reversible in SQLite without complex table recreation.
  // We will log a warning instead of attempting to drop columns.
  console.log('[Migration] Rolling back 038 is not supported. The new columns (model_type, tensor_parallel_size, model_format, quantization_method) will be left in place.');
};

module.exports = {
  up,
  down,
};
