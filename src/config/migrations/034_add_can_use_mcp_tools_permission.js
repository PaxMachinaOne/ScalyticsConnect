// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); // Corrected import

const MIGRATION_NAME = '034_add_can_use_mcp_tools_permission';

async function up() {
  try {
    await db.runAsync(`
      INSERT OR IGNORE INTO admin_permissions (permission_key, name, description)
      VALUES ('can_use_mcp_tools', 'Use MCP Tools', 'Allows users to access and use AI Agents and MCP Tools.');
    `);
    console.log(`Migration ${MIGRATION_NAME}: Added/Ensured can_use_mcp_tools permission in admin_permissions successfully.`);
  } catch (err) {
    console.error(`Error running migration ${MIGRATION_NAME}:`, err);
    throw err;
  }
}

async function down() {
  return Promise.resolve(); 
}

module.exports = { up, down, name: MIGRATION_NAME };
