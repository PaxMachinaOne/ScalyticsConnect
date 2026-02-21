// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); 

const MIGRATION_NAME = '003_add_scalytics_api'; 
const SCALYTICS_MCP_PROVIDER_NAME = 'Scalytics MCP';
const SCALYTICS_API_PROVIDER_NAME = 'Scalytics API'; 

async function up() {
  console.log(`Running migration: ${MIGRATION_NAME}`);

  const columns = await db.allAsync(`PRAGMA table_info(api_providers)`);
  const isExternalColumnExists = columns.some(col => col.name === 'is_external');

  if (!isExternalColumnExists) {
     console.log(`- Adding is_external column to api_providers before inserting providers`);
     await db.runAsync(`ALTER TABLE api_providers ADD COLUMN is_external BOOLEAN DEFAULT 0`);
     console.log(`- Added is_external column.`);
  }

  await db.runAsync(`
    INSERT OR IGNORE INTO api_providers (name, description, api_url, website, is_active, is_external)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `, [
    SCALYTICS_MCP_PROVIDER_NAME,
    'Model Context Protocol provider for standardized AI interactions',
    'https://api.example.com/mcp', 
    '',
    1, 
    0  
  ]);
  console.log(`- Added/Ensured '${SCALYTICS_MCP_PROVIDER_NAME}' provider exists (active, internal).`);

  await db.runAsync(`
    INSERT OR IGNORE INTO api_providers (name, description, api_url, website, is_active, is_external)
    VALUES
      (?, ?, ?, ?, ?, ?)
  `, [
    SCALYTICS_API_PROVIDER_NAME,
    'OpenAI-compatible API endpoint for this Scalytics Copilot instance',
    '', 
    '', 
    1,  
    0  
  ]);
  console.log(`- Added/Ensured '${SCALYTICS_API_PROVIDER_NAME}' provider exists (active, internal).`);

  await db.runAsync(`
    INSERT OR IGNORE INTO system_settings (key, value)
    VALUES
      ('scalytics_api_enabled', 'false'), -- Disabled by default
      ('scalytics_api_rate_limit_window_ms', '900000'),
      ('scalytics_api_rate_limit_max', '100')
  `);
  console.log('- Added Scalytics API system settings (if not exists).');

  console.log(`Migration ${MIGRATION_NAME} completed successfully.`);
}

async function down() {
  console.log(`Rolling back migration: ${MIGRATION_NAME}`);

  await db.runAsync(`
    DELETE FROM system_settings
    WHERE key IN ('scalytics_api_enabled', 'scalytics_api_rate_limit_window_ms', 'scalytics_api_rate_limit_max')
  `);
  console.log('- Removed Scalytics API system settings.');

  await db.runAsync(`
    DELETE FROM api_providers
    WHERE name = ?
  `, [SCALYTICS_MCP_PROVIDER_NAME]);
  console.log(`- Removed '${SCALYTICS_MCP_PROVIDER_NAME}' provider.`);

  await db.runAsync(`
    DELETE FROM api_providers
    WHERE name = ?
  `, [SCALYTICS_API_PROVIDER_NAME]);
  console.log(`- Removed '${SCALYTICS_API_PROVIDER_NAME}' provider.`);

  console.log(`Migration ${MIGRATION_NAME} rollback completed.`);
}

module.exports = {
  name: MIGRATION_NAME,
  up,
  down
};
