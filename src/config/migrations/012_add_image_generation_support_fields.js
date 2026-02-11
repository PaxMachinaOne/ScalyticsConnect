// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); 

/**
 * Migration to set image generation configurations.
 * - Sets default image_generation_endpoint_path for known providers.
 * - Adds 'image_gen' tool status to mcp_local_tools_status.
 * - Note: Obsolete column 'default_image_model_external_id' is no longer added by this script.
 *         Redundant column additions for 'models' and 'api_providers' (covered by schema.sql) removed.
 */
async function runMigration() {
  console.log('[Migration] Running: 012_add_image_generation_support_fields.js (Refactored: Data updates only)');
  try {
    await db.runAsync('BEGIN TRANSACTION;');

    const apiProvidersColumns = await db.allAsync("PRAGMA table_info(api_providers)");

    console.log('[Migration] Setting default image_generation_endpoint_path for known providers.');
    
    await db.runAsync(
      "UPDATE api_providers SET image_generation_endpoint_path = ? WHERE name = ? AND image_generation_endpoint_path IS NULL",
      ['/v1/images/generations', 'OpenAI']
    );
        
    await db.runAsync(
      "UPDATE api_providers SET image_generation_endpoint_path = ? WHERE name = ? AND image_generation_endpoint_path IS NULL",
      ['/v1/images/generations', 'xAI']
    );
    
    if (apiProvidersColumns.some(col => col.name === 'default_image_model_external_id')) {
      console.log('[Migration] Column "default_image_model_external_id" found on "api_providers" table. This is no longer used by the "Image Generation as Tool" approach. Consider removing manually if desired, migration will not drop it to preserve data from previous states.');
    }

    const imageGenTool = await db.getAsync("SELECT tool_name FROM mcp_local_tools_status WHERE tool_name = 'image_gen'");
    if (!imageGenTool) {
      console.log("[Migration] Adding 'image_gen' to mcp_local_tools_status, defaulting to inactive.");
      await db.runAsync("INSERT INTO mcp_local_tools_status (tool_name, is_active) VALUES ('image_gen', 0)");
    } else {
      console.log("[Migration] Tool 'image_gen' already exists in mcp_local_tools_status.");
    }

    await db.runAsync('COMMIT;');
    console.log('[Migration] Finished: 012_add_image_generation_support_fields.js (Adjusted)');
  } catch (error) {
    await db.runAsync('ROLLBACK;');
    console.error('[Migration Error] Failed to apply 012_add_image_generation_support_fields.js (Adjusted):', error);
    throw error;
  }
}

module.exports = {
  runMigration
};
