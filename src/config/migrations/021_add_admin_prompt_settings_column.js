// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); 

/**
 * Adds the admin_default_prompts column to the models table.
 */
module.exports = {
  up: async () => {
    const migrationName = '021_add_admin_prompt_settings_column'; 
    console.log(`Applying migration: ${migrationName}`);
    await db.runAsync('BEGIN TRANSACTION');
    try {
      const tableInfo = await db.allAsync('PRAGMA table_info(models)');
      const columnExists = tableInfo.some(col => col.name === 'admin_default_prompts');

      if (!columnExists) {
        await db.runAsync('ALTER TABLE models ADD COLUMN admin_default_prompts TEXT DEFAULT NULL');
        console.log('  Added column: admin_default_prompts');
      } else {
        console.log('  Column admin_default_prompts already exists, skipping add.');
      }
      await db.runAsync('COMMIT');
      console.log(`Migration ${migrationName} applied successfully.`);
    } catch (error) {
      console.error(`Error during migration ${migrationName}:`, error);
      await db.runAsync('ROLLBACK');
      throw error;
    }
  },

  down: async () => {
    const migrationName = '021_add_admin_prompt_settings_column'; 
    console.log(`Reverting migration: ${migrationName}`);
    console.warn(`Reverting migration ${migrationName} (dropping admin_default_prompts) is not automatically supported.`);
    console.log(`Migration ${migrationName} revert action skipped.`);
  }
};
