// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration: 008_add_user_tool_configs
 *
 * Creates the user_tool_configs table to store user-specific configurations
 * for tools like Scalytics Deep Search.
 */
const { db } = require('../../models/db'); 

const MIGRATION_NAME = '008_add_user_tool_configs';

async function up() {
  console.log(`\nRunning migration ${MIGRATION_NAME}: Creating user_tool_configs table...`);

  try {
    // Use IF NOT EXISTS for idempotency
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS user_tool_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,    -- e.g., 'scalytics_search'
        config TEXT NOT NULL,       -- Store configuration as JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, tool_name), -- Ensure only one config per user per tool
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    // Create an index for faster lookups by user_id and tool_name
    await db.runAsync(`
      CREATE INDEX IF NOT EXISTS idx_user_tool_configs_user_tool
      ON user_tool_configs (user_id, tool_name);
    `);

    // Create triggers to automatically update updated_at timestamp
    await db.runAsync(`
      CREATE TRIGGER IF NOT EXISTS update_user_tool_configs_updated_at
      AFTER UPDATE ON user_tool_configs
      FOR EACH ROW
      BEGIN
        UPDATE user_tool_configs SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
    return true; // Indicate success
  } catch (err) {
    console.error(`Migration ${MIGRATION_NAME} failed:`, err);
    throw err; // Re-throw error to halt migration process
  }
}

module.exports = {
  name: MIGRATION_NAME,
  up,
};
