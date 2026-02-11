// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db');

const MIGRATION_NAME = '001_add_embedding_dimension_to_models';

/**
 * Adds the embedding_dimension column to the models table.
 */
async function up() {
  console.log(`\nRunning migration ${MIGRATION_NAME}: Adding embedding_dimension column to models table...`);
  try {
    const tableInfo = await db.allAsync("PRAGMA table_info(models)");
      const columnExists = tableInfo.some(col => col.name === 'embedding_dimension');

      if (!columnExists) {
        console.log('Adding embedding_dimension column to models...');
        await db.runAsync(
          `ALTER TABLE models ADD COLUMN embedding_dimension INTEGER DEFAULT NULL`
        );
        console.log('embedding_dimension column added to models.');
      } else {
        console.log('embedding_dimension column already exists in models, skipping addition.');
      }
      console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
      return true;
    } catch (error) {
      console.error(`Error applying migration ${MIGRATION_NAME}:`, error);
      throw error;
    }
  }

async function down() {
  console.warn(`Reverting ${MIGRATION_NAME}: SQLite does not directly support dropping columns. Manual intervention may be required to remove the 'embedding_dimension' column from 'models'.`);
}

module.exports = {
  name: MIGRATION_NAME,
  up,
  down,
};
