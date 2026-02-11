// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); // Adjust path as needed

async function up() {
  // Add is_embedding_model column to models table
  try {
    await db.execAsync(`
      ALTER TABLE models ADD COLUMN is_embedding_model BOOLEAN DEFAULT 0;
    `);
  } catch (err) {
    // Ignore error if column already exists (for idempotency)
    if (!err.message.includes('duplicate column name')) {
      console.error('  Error adding is_embedding_model column:', err);
      throw err; // Re-throw if it's not a duplicate column error
    }
  }

  // Create mcp_local_tools_status table
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS mcp_local_tools_status (
        tool_name TEXT PRIMARY KEY,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('  Error creating mcp_local_tools_status table:', err);
    throw err;
  }

  // Add new permission key for using deep search
  try {
    await db.runAsync(
      `INSERT OR IGNORE INTO admin_permissions (permission_key, name, description) VALUES (?, ?, ?)`,
      ['agents:use:deep_search', 'Use Scalytics Deep Search (Deep Search)', 'Allows users to initiate deep search tasks via the Scalytics Deep Search interface.']
    );
  } catch (err) {
    console.error('  Error adding agents:use:deep_search permission key:', err);
    throw err;
  }

  // Grant permission to Admin and Power User groups by default
  try {
    const adminGroup = await db.getAsync("SELECT id FROM groups WHERE name = 'Administrator'");
    const powerUserGroup = await db.getAsync("SELECT id FROM groups WHERE name = 'Power User'");

    if (adminGroup) {
      await db.runAsync(
        `INSERT OR IGNORE INTO permission_templates (permission_key, group_id, default_value, description) VALUES (?, ?, ?, ?)`,
        ['agents:use:deep_search', adminGroup.id, 1, 'Default permission for Administrators']
      );
    }
    if (powerUserGroup) {
       await db.runAsync(
        `INSERT OR IGNORE INTO permission_templates (permission_key, group_id, default_value, description) VALUES (?, ?, ?, ?)`,
        ['agents:use:deep_search', powerUserGroup.id, 1, 'Default permission for Power Users']
      );
    }
  } catch (err) {
     console.error('  Error granting default agents:use:deep_search permission to groups:', err);
     // Don't throw, as the permission key itself might have been added successfully
  }

}

async function down() {
  // Optional: Implement rollback logic if needed
  // Note: SQLite doesn't easily support dropping columns.
  // Rollback might involve creating a new table without the column and copying data.
  // For simplicity, we might just log or skip column removal.
  await db.execAsync('DROP TABLE IF EXISTS mcp_local_tools_status;');
  // Also remove the permission and templates on rollback
  await db.runAsync("DELETE FROM permission_templates WHERE permission_key = 'agents:use:deep_search';");
  await db.runAsync("DELETE FROM admin_permissions WHERE permission_key = 'agents:use:deep_search';");
}

module.exports = { up, down };
