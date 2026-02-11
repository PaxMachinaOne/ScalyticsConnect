// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration: Add isLoading column to messages table.
 */
const { db } = require('../../models/db');
const MIGRATION_NAME = '016_add_message_status_column';

/**
 * Checks if a column exists in a table.
 * @param {string} tableName - The name of the table.
 * @param {string} columnName - The name of the column.
 * @returns {Promise<boolean>} - True if the column exists, false otherwise.
 */
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

/**
 * Runs the migration to add the isLoading column.
 */
async function runMigration() {
  console.log(`[Migration] Running: ${MIGRATION_NAME}`);
  try {
    const exists = await columnExists('messages', 'isLoading');
    
    if (!exists) {
      console.log(`[Migration] Column 'isLoading' does not exist in 'messages'. Adding...`);
      await db.runAsync(`ALTER TABLE messages ADD COLUMN isLoading BOOLEAN DEFAULT 0`);
      console.log(`[Migration] Column 'isLoading' added successfully with default value 0.`);
    } else {
      console.log(`[Migration] Column 'isLoading' already exists in 'messages'. Skipping.`);
    }
    console.log(`[Migration] Completed: ${MIGRATION_NAME}`);
    return true; 
  } catch (error) {
    console.error(`[Migration] FAILED: ${MIGRATION_NAME}: ${error.message}`);
    throw error; 
  }
}

module.exports = {
  runMigration, 
  MIGRATION_NAME 
};
