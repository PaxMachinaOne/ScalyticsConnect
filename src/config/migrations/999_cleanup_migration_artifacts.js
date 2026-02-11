// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); 

/**
 * Cleans up potential leftover artifacts from failed migrations, ensures
 * the admin_model_access_view is correct, and vacuums the database.
 * This should run LAST in the migration sequence.
 */
module.exports = {
  up: async () => { 
    const migrationName = '999_cleanup_migration_artifacts'; 
    console.log(`Applying migration: ${migrationName}`);

    try {
      console.log('  Step 1: Dropping potential leftover temporary tables...');
      const tempTableNames = [
        'models_new', 
        'models_old_migration_backup', 
        'models_temp_recreate', 
        'models_old_drop_prompt_cols_backup',
        'group_model_access_old_rebuild' 
      ];
      for (const tempTable of tempTableNames) {
        try {
          await db.runAsync(`DROP TABLE IF EXISTS ${tempTable}`);
          console.log(`  Dropped table ${tempTable} (if it existed).`);
        } catch (dropError) {
          console.warn(`  Warning: Failed to drop potential temp table ${tempTable}:`, dropError.message);
        }
      }
      console.log('  Finished dropping temp tables.');

      console.log('  Step 2: Dropping and recreating admin_model_access_view...');
      await db.runAsync('BEGIN TRANSACTION');
      try {
        await db.runAsync('DROP VIEW IF EXISTS admin_model_access_view');
        console.log('  Dropped view admin_model_access_view (if exists).');

        const currentTableInfo = await db.allAsync('PRAGMA table_info(models)');
        const currentColumns = currentTableInfo.map(col => col.name);
        const hasExternalModelId = currentColumns.includes('external_model_id');
        const hasDefaultSystemPrompt = currentColumns.includes('default_system_prompt');

        let selectClause = `m.id AS model_id, m.name AS model_name, m.description, m.model_path, m.context_window, `;
        if (hasDefaultSystemPrompt) {
          selectClause += `CASE WHEN m.default_system_prompt IS NULL THEN '' ELSE m.default_system_prompt END AS default_system_prompt, `;
        } else {
          selectClause += `'' AS default_system_prompt, `;
        }
        selectClause += `m.external_provider_id, `;
        if (hasExternalModelId) {
          selectClause += `m.external_model_id, `;
        }
        selectClause += `m.created_at, m.updated_at, g.id AS group_id, grp.name AS group_name`;

        const createViewSql = `
          CREATE VIEW admin_model_access_view AS
          SELECT ${selectClause}
          FROM models m
          CROSS JOIN groups grp
          JOIN user_groups g ON g.group_id = grp.id
          WHERE grp.name = 'Administrator' AND m.is_active = 1`;

        await db.runAsync(createViewSql);
        console.log('  Recreated view admin_model_access_view successfully.');
        await db.runAsync('COMMIT');
      } catch (viewError) {
        console.error('  Error during view recreation:', viewError);
        await db.runAsync('ROLLBACK');
      }
      console.log('  Finished view recreation attempt.');


      console.log('  Step 3: Vacuuming database...');
      try {
        await db.execAsync('VACUUM;');
        console.log('  Database vacuum completed successfully.');
      } catch (vacuumError) {
        console.error('  Error during database VACUUM:', vacuumError);
      }

      console.log(`Migration ${migrationName} applied successfully (cleanup attempted).`);

    } catch (error) {
      console.error(`Error applying migration ${migrationName}:`, error);
      throw error; 
    }
  },

  down: async () => { 
    const migrationName = '999_cleanup_migration_artifacts'; 
    console.log(`Reverting migration: ${migrationName}`);
    console.log(`Migration ${migrationName} revert action skipped (cleanup script).`);
  }
};
