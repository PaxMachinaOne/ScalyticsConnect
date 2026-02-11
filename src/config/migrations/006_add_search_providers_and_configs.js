// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); // Import the shared db instance

const MIGRATION_NAME = '006_add_search_providers_and_configs';

/**
 * Consolidated Migration for AI Agents / Scalytics Deep Search Feature:
 * - Ensures system_settings table exists and adds 'air_gapped_mode'.
 * - Adds 'supports_extra_config' column to 'api_providers' table if not exists.
 * - Adds 'extra_config' column to 'api_keys' table if not exists.
 * - Adds/Updates 'Google Search' and 'Bing Search' providers.
 * - Adds embedding model preference settings to system_settings.
 */

async function up() {
  console.log(`\nRunning migration ${MIGRATION_NAME}: Applying search providers and AI agent configs...`);
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY NOT NULL,
          value TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // --- Add system settings (air_gapped_mode, embedding prefs) ---
      await db.runAsync(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?);`, ['air_gapped_mode', 'false']);
      await db.runAsync(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?);`, ['preferred_local_embedding_model_id', null]);
      await db.runAsync(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?);`, ['fallback_external_embedding_model_id', null]);
      // --- End system settings ---


      // --- Add supports_extra_config column to api_providers ---
      let tableInfoProviders = await db.allAsync("PRAGMA table_info(api_providers)");
      let columnExistsProviders = tableInfoProviders.some(col => col.name === 'supports_extra_config');
      if (!columnExistsProviders) {
        await db.runAsync(`ALTER TABLE api_providers ADD COLUMN supports_extra_config INTEGER DEFAULT 0`);
      }
      // --- End Add Column (api_providers) ---


      // --- Add extra_config column to api_keys ---
      let tableInfoKeys = await db.allAsync("PRAGMA table_info(api_keys)");
      let columnExistsKeys = tableInfoKeys.some(col => col.name === 'extra_config');
      if (!columnExistsKeys) {
        await db.runAsync(`ALTER TABLE api_keys ADD COLUMN extra_config TEXT DEFAULT NULL`);
      }
      // --- End Add Column (api_keys) ---


      // --- Add/Update Google Search Provider ---
       const googleExists = await db.getAsync("SELECT 1 FROM api_providers WHERE name = ?", ['Google Search']);
       if (!googleExists) {
         const googleResult = await db.runAsync(
           `INSERT INTO api_providers (name, description, is_active, requires_api_key, supports_extra_config, is_external, is_manual, website, api_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           ['Google Search', 'Google Custom Search JSON API for web results.', 1, 1, 1, 1, 0, 'https://ai.google.dev/', 'https://www.googleapis.com/customsearch/v1'] 
         );
       } else {
         await db.runAsync("UPDATE api_providers SET supports_extra_config = 1, description = ?, requires_api_key = 1, is_external = 1, is_manual = 0 WHERE name = ?",
          ['Google Custom Search JSON API for web results.', 'Google Search']); 
       }
       // --- End Google Search ---


      // --- Add/Update Bing Search Provider ---
       const bingExists = await db.getAsync("SELECT 1 FROM api_providers WHERE name = ?", ['Bing Search']);
       if (!bingExists) {
         const bingResult = await db.runAsync(
           `INSERT INTO api_providers (name, description, is_active, requires_api_key, supports_extra_config, is_external, is_manual, website, api_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           ['Bing Search', 'Microsoft Bing Web Search API for web results.', 1, 1, 0, 1, 0, 'https://www.microsoft.com/bing/apis/web-search-api', 'https://api.bing.microsoft.com/v7.0/search']
         );
       } else {
          await db.runAsync("UPDATE api_providers SET supports_extra_config = 0, description = ?, requires_api_key = 1, is_external = 1, is_manual = 0 WHERE name = ?",
          ['Microsoft Bing Web Search API for web results.', 'Bing Search']); 
       }
       // --- End Bing Search ---

    } catch (error) {
      console.error(`Error applying migration ${MIGRATION_NAME}:`, error);
      throw error;
    }
    console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
    return true; // Indicate success
  }

async function down() {
  console.warn(`Rolling back migration: ${MIGRATION_NAME}`);
  try {
    // Note: The original down migration did not remove columns, only data.
    // This behavior is preserved.
    await db.runAsync("DELETE FROM api_providers WHERE name IN (?, ?)", ['Google Search', 'Bing Search']);
    await db.runAsync("DELETE FROM system_settings WHERE key IN (?, ?, ?, ?)", [ // Added air_gapped_mode here
        'preferred_local_embedding_model_id',
        'fallback_external_embedding_model_id',
        'air_gapped_mode'
    ]);
    console.warn('Search providers and specific system settings removed by down migration.');
    console.warn('Columns added by this migration (supports_extra_config, extra_config) were not removed during rollback, as per original down logic.');
  } catch (error) {
    console.error(`Error rolling back migration ${MIGRATION_NAME}:`, error);
    // Decide if to throw or just log for down migrations
  }
}

module.exports = {
  name: MIGRATION_NAME,
  up,
  down,
};
