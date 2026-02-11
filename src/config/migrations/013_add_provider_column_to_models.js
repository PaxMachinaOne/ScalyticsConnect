// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); 

const MIGRATION_NAME = '013_add_provider_column_to_models';

async function up() {
  console.log(`\nRunning migration ${MIGRATION_NAME}: Adding provider column to models table...`);
  try {
    const tableInfo = await db.allAsync("PRAGMA table_info(models)");
    const columnExists = tableInfo.some(col => col.name === 'provider');

    if (!columnExists) {
      await db.runAsync(`ALTER TABLE models ADD COLUMN provider TEXT DEFAULT NULL`);
      console.log(`  Added column 'provider' to 'models' table.`);
    } else {
      console.log(`  Column 'provider' already exists in 'models' table. Skipping.`);
    }
    
    await db.runAsync(`
      UPDATE models 
      SET provider = 'local' 
      WHERE external_provider_id IS NULL AND (provider IS NULL OR provider = '')
    `);
    console.log(`  Populated 'provider' column for local models.`);

    console.log(`  For existing external models, the 'provider' column might need to be populated manually or via application logic based on 'external_provider_id'.`);

    console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
    return true;
  } catch (err) {
    console.error(`Migration ${MIGRATION_NAME} failed:`, err);
    throw err;
  }
}

async function down() {
  console.warn(`Reverting ${MIGRATION_NAME}: SQLite does not directly support dropping columns. Manual intervention may be required to remove the 'provider' column from 'models'.`);
}

module.exports = {
  name: MIGRATION_NAME,
  up,
  down,
};
