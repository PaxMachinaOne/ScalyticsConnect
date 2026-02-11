// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); 

/**
 * Rebuilds the group_model_access table to fix potential internal inconsistencies
 * in its foreign key constraint definition referencing the 'models' table,
 * especially after complex schema changes to 'models'.
 * Preserves existing data.
 * This should run AFTER 'consolidated-refactor-admin-prompt-settings'.
 */
module.exports = {
  up: async () => { 
    const migrationName = '032_rebuild_group_model_access'; 
    console.log(`Applying migration: ${migrationName}`);

    await db.runAsync('BEGIN TRANSACTION');
    console.log('  Started transaction.');

    const oldTableName = 'group_model_access_old_rebuild';
    const tableName = 'group_model_access';

    try {
      // --- Disable FKs ---
      console.log('  Disabling foreign key checks...');
      await db.runAsync('PRAGMA foreign_keys = OFF');

      // --- Rename original table ---
      console.log(`  Renaming ${tableName} to ${oldTableName}...`);
      await db.runAsync(`DROP TABLE IF EXISTS ${oldTableName}`);
      await db.runAsync(`ALTER TABLE ${tableName} RENAME TO ${oldTableName}`);
      console.log(`  Renamed ${tableName} to ${oldTableName}.`);

      // --- Recreate table with correct schema ---
      console.log(`  Recreating ${tableName} table...`);
      // Use the definition from schema.sql
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER NOT NULL,
          model_id INTEGER NOT NULL,
          can_access BOOLEAN DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
          FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
          UNIQUE(group_id, model_id)
        )
      `);
      console.log(`  Created new ${tableName} table.`);

      // --- Copy data back ---
      console.log(`  Copying data from ${oldTableName} to ${tableName}...`);
      const oldTableInfo = await db.allAsync(`PRAGMA table_info(${oldTableName})`);
      const columnsToCopy = oldTableInfo.map(col => `"${col.name}"`).join(', ');
      const copySql = `INSERT INTO ${tableName} (${columnsToCopy}) SELECT ${columnsToCopy} FROM ${oldTableName}`;
      console.log(`  Executing SQL: ${copySql}`);
      await db.runAsync(copySql);
      console.log(`  Copied data to ${tableName}.`);

      // --- Drop old table ---
      console.log(`  Dropping old table ${oldTableName}...`);
      await db.runAsync(`DROP TABLE ${oldTableName}`);
      console.log(`  Dropped table ${oldTableName}.`);

      // --- Re-enable FKs and Verify ---
      console.log('  Re-enabling and checking foreign keys...');
      await db.runAsync('PRAGMA foreign_keys = ON');
      const fkCheckResult = await db.allAsync('PRAGMA foreign_key_check');
      if (fkCheckResult.length > 0) {
        console.error('  FOREIGN KEY CHECK FAILED:', fkCheckResult);
        throw new Error(`Foreign key constraints failed after rebuilding ${tableName}.`);
      }
      console.log('  Foreign keys re-enabled and checked successfully.');

      // --- Commit ---
      await db.runAsync('COMMIT');
      console.log('  Committed transaction.');
      console.log(`Migration ${migrationName} applied successfully.`);

    } catch (error) {
      console.error(`Error during migration ${migrationName}:`, error);
      console.log('  Rolling back transaction...');
      await db.runAsync('ROLLBACK');
      try { await db.runAsync('PRAGMA foreign_keys = ON'); } catch (fkErr) {}
      console.log('  Transaction rolled back.');
      throw error;
    }
  },

  down: async () => { 
    const migrationName = '032_rebuild_group_model_access'; 
    console.log(`Reverting migration: ${migrationName}`);
    console.warn(`Reverting migration ${migrationName} is complex and potentially data-lossy.`);
    console.log(`Migration ${migrationName} revert action skipped.`);
  }
};
