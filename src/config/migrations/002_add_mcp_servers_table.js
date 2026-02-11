// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db');

const MIGRATION_NAME = '002_add_mcp_servers_table';

/**
 * Creates the mcp_servers table for registering external MCP servers.
 */
async function up() {
  console.log(`\nRunning migration ${MIGRATION_NAME}: Creating mcp_servers table...`);
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          connection_type TEXT NOT NULL CHECK(connection_type IN ('command', 'websocket', 'stdio')),
          connection_details TEXT NOT NULL, -- JSON string, content depends on connection_type
          api_key_hash TEXT,                -- Hashed API key for authentication (NULL if not applicable)
          is_active BOOLEAN DEFAULT 0,      -- Admin controlled activation
          status TEXT DEFAULT 'disconnected' CHECK(status IN ('connecting', 'connected', 'disconnected', 'error')),
          last_seen TIMESTAMP,
          last_error TEXT,                  -- Store last connection error message
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name);`);
      await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_mcp_servers_active_type ON mcp_servers(is_active, connection_type);`);
      console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
      return true;
    } catch (error) {
      console.error(`Error applying migration ${MIGRATION_NAME}:`, error);
      throw error;
    }
  }

async function down() {
  console.warn(`Rolling back migration: ${MIGRATION_NAME}`);
  try {
    await db.runAsync(`DROP TABLE IF EXISTS mcp_servers;`);
    console.warn('Table mcp_servers dropped.');
  } catch (error) {
    console.error(`Error rolling back migration ${MIGRATION_NAME}:`, error);
  }
}

module.exports = {
  name: MIGRATION_NAME,
  up,
  down,
};
