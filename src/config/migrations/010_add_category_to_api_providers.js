// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db');

const MIGRATION_NAME = '010_add_category_to_api_providers';

async function up() {
  console.log(`\nRunning migration ${MIGRATION_NAME}: Adding category column to api_providers and setting refined categories...`);
  try {
    await db.runAsync('BEGIN TRANSACTION');

    const tableInfo = await db.allAsync("PRAGMA table_info(api_providers)");
    const columnExists = tableInfo.some(col => col.name === 'category');

    if (!columnExists) {
      await db.runAsync(`ALTER TABLE api_providers ADD COLUMN category TEXT DEFAULT NULL`);
      console.log("Added 'category' column to api_providers table.");
    } else {
      console.log("'category' column already exists in api_providers table.");
    }

    const providersToCategorize = [
      { name: 'Google Search', category: 'search' },
      { name: 'Bing Search', category: 'search' },
      { name: 'Brave Search', category: 'search' },
      { name: 'OpenAI', category: 'ext_llm' },
      { name: 'Anthropic', category: 'ext_llm' },
      { name: 'Cohere', category: 'ext_llm' },
      { name: 'Mistral', category: 'ext_llm' },
      { name: 'Google', category: 'ext_llm' },
      { name: 'Hugging Face', category: 'hf' },
      { name: 'Local', category: 'int_llm' }, 
      { name: 'Scalytics API', category: 'system_api' } 
    ];

    for (const provider of providersToCategorize) {
      const result = await db.runAsync(
        `UPDATE api_providers SET category = ? WHERE name = ? AND (category IS NULL OR category != ?)`,
        [provider.category, provider.name, provider.category]
      );
      if (result.changes > 0) {
        console.log(`Set category to '${provider.category}' for provider '${provider.name}'.`);
      }
    }
    const defaultCategorizationResult = await db.runAsync(
      `UPDATE api_providers 
       SET category = 'ext_llm' 
       WHERE category IS NULL 
         AND is_external = 1
         AND name NOT IN ('Google Search', 'Bing Search', 'Brave Search', 'Scalytics API')` 
    );
    if (defaultCategorizationResult.changes > 0) {
        console.log(`Set default category to 'ext_llm' for ${defaultCategorizationResult.changes} other external provider(s).`);
    }

    await db.runAsync('COMMIT');
    console.log(`Migration ${MIGRATION_NAME} completed successfully with refined categories.`);
    return true;
  } catch (error) {
    await db.runAsync('ROLLBACK');
    console.error(`Error applying migration ${MIGRATION_NAME}:`, error);
    throw error;
  }
}

async function down() {
  console.warn(`\nRolling back migration ${MIGRATION_NAME}: Setting category to NULL for categorized providers.`);
  try {
    await db.runAsync('BEGIN TRANSACTION');
    await db.runAsync(
      `UPDATE api_providers SET category = NULL WHERE category IS NOT NULL`
    );
    console.log("Set 'category' to NULL for all previously categorized providers.");
    await db.runAsync('COMMIT');
    console.warn(`Migration ${MIGRATION_NAME} rollback complete. The 'category' column itself was not removed.`);
  } catch (error) {
    await db.runAsync('ROLLBACK');
    console.error(`Error rolling back migration ${MIGRATION_NAME}:`, error);
  }
}

module.exports = {
  name: MIGRATION_NAME,
  up,
  down,
};
