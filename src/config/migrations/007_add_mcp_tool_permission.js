// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); 

const MIGRATION_NAME = '007_add_mcp_tool_permission';

async function up() {
  
  const permissionName = 'can_use_mcp_tools';
  const permissionDescription = 'Allows users to access and use MCP tools / AI Agents.';
  const adminGroupId = 1;
  const standardUserGroupId = 2;

  try {
    await db.runAsync(`
      INSERT INTO permissions (key, name, description)
      SELECT ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = ?);
    `, [permissionName, permissionName, permissionDescription, permissionName]); 
    

    const permission = await db.getAsync('SELECT id FROM permissions WHERE key = ?', [permissionName]); 
    if (!permission) {
      throw new Error(`Failed to find or create permission '${permissionName}'`);
    }
    const permissionId = permission.id;

    await db.runAsync(`
      INSERT OR IGNORE INTO permission_templates (permission_key, group_id, default_value, description) VALUES (?, ?, ?, ?)
    `, [permissionName, adminGroupId, 1, 'Default permission for Administrators']); 
    

    await db.runAsync(`
      INSERT OR IGNORE INTO permission_templates (permission_key, group_id, default_value, description) VALUES (?, ?, ?, ?)
    `, [permissionName, standardUserGroupId, 1, 'Default permission for Standard Users']); 
    

  } catch (err) {
    console.error(`Error running migration ${MIGRATION_NAME}:`, err);
    throw err; 
  }
}

async function down() {
  console.warn(`Rolling back migration: ${MIGRATION_NAME} (Not fully implemented)`);
  try {
    
  } catch (err) {
    console.error(`Error rolling back migration ${MIGRATION_NAME}:`, err);
    throw err;
  }
}

module.exports = { up, down, name: MIGRATION_NAME };
