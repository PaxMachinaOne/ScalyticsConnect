// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); 

/**
 * Adds admin_prompt_profile column and removes old prompt flag columns from models table.
 */
module.exports = {
  up: async () => { 
    const migrationName = '024_add_profile_remove_flags_from_models'; 
    console.log(`Applying migration: ${migrationName}`);
    try {
      const tableInfo = await db.allAsync('PRAGMA table_info(models)');
      const existingColumns = tableInfo.map(col => col.name);

      if (!existingColumns.includes('admin_prompt_profile')) {
        console.log('  Adding column: admin_prompt_profile to models');
        await db.runAsync(`ALTER TABLE models ADD COLUMN admin_prompt_profile TEXT DEFAULT NULL`);
        console.log('  Column admin_prompt_profile added.');
      } else {
        console.log('  Column admin_prompt_profile already exists, skipping add.');
      }


      console.log(`Migration ${migrationName} applied successfully (added admin_prompt_profile if needed).`);
    } catch (error) {
      console.error(`Error applying migration ${migrationName}:`, error);
      throw error; 
    }
  },

  down: async () => { 
    const migrationName = '024_add_profile_remove_flags_from_models'; 
    console.log(`Reverting migration: ${migrationName}`);
    try {
       console.log(`  Attempting to drop column: admin_prompt_profile from models`);
       await db.runAsync(`ALTER TABLE models DROP COLUMN admin_prompt_profile`);
       console.log(`  Column admin_prompt_profile dropped.`);
       console.warn(`  Reverting migration ${migrationName} does not restore the old prompt flag columns or their data.`);
    } catch (error) {
      console.error(`Error reverting migration ${migrationName}:`, error);
    }
  }
};
