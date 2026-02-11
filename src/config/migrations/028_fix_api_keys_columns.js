// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Fix for missing columns in api_keys table.
 * 
 * This script checks for and adds missing columns to the api_keys table.
 * Addresses issue where api_keys table exists but may be missing certain columns
 * that later migrations and code expect to be present.
 */

const { db } = require('../../models/db');

/**
 * Fix missing columns in api_keys table
 * 
 * @returns {Promise<Object>} Results of the fix operation
 */
async function fixApiKeysColumns() {
  console.log('[Migration: 028_fix_api_keys_columns] Checking for missing columns in api_keys table...');
  
  const results = {
    success: false,
    columnsAdded: [],
    errors: []
  };
  
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );
    
    if (!tableExists) {
      console.log('[Migration: 028_fix_api_keys_columns] api_keys table does not exist, creating it...');
      
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id INTEGER NOT NULL,
          key_name TEXT NOT NULL DEFAULT "",
          key_value TEXT NOT NULL DEFAULT "",
          is_encrypted BOOLEAN DEFAULT 0,
          user_id INTEGER,
          is_active BOOLEAN DEFAULT 1,
          is_global BOOLEAN DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(provider_id, user_id, is_global)
        )
      `);
      
      await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id)`);
      await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
      await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_api_keys_global ON api_keys(is_global)`);
      await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_api_keys_user_provider ON api_keys(user_id, provider_id, is_active)`);
      
      console.log('[Migration: 028_fix_api_keys_columns] Created api_keys table with all required columns');
      return {
        success: true,
        message: 'Created new api_keys table with all required columns',
        columnsAdded: ['id', 'provider_id', 'key_name', 'key_value', 'is_encrypted', 'user_id', 'is_active', 'is_global', 'created_at', 'updated_at']
      };
    }
    
    await db.runAsync('BEGIN TRANSACTION');
    
    try {
      const columns = await db.allAsync("PRAGMA table_info(api_keys)");
      const columnNames = columns.map(col => col.name);
      
      console.log(`[Migration: 028_fix_api_keys_columns] Current columns in api_keys table: ${columnNames.join(', ')}`);
      
      const requiredColumns = [
        { name: 'key_name', definition: 'TEXT NOT NULL DEFAULT ""' },
        { name: 'key_value', definition: 'TEXT NOT NULL DEFAULT ""' },
        { name: 'is_encrypted', definition: 'BOOLEAN DEFAULT 0' },
        { name: 'user_id', definition: 'INTEGER' },
        { name: 'is_active', definition: 'BOOLEAN DEFAULT 1' },
        { name: 'is_global', definition: 'BOOLEAN DEFAULT 0' }
      ];
      
      for (const col of requiredColumns) {
        if (!columnNames.includes(col.name)) {
          console.log(`[Migration: 028_fix_api_keys_columns] Adding missing column: ${col.name}`);
          
          await db.runAsync(`ALTER TABLE api_keys ADD COLUMN ${col.name} ${col.definition}`);
          results.columnsAdded.push(col.name);
          
          if (col.name === 'key_name' || col.name === 'key_value') {
            await db.runAsync(`UPDATE api_keys SET ${col.name} = 'legacy_key' WHERE ${col.name} IS NULL`);
            console.log(`[Migration: 028_fix_api_keys_columns] Set default value for ${col.name} in existing rows`);
          }
        }
      }
      
      const indexesInfo = await db.allAsync("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_keys'");
      const indexNames = indexesInfo.map(idx => idx.name);
      
      const requiredIndexes = [
        { name: 'idx_api_keys_provider', columns: 'provider_id' },
        { name: 'idx_api_keys_user', columns: 'user_id' },
        { name: 'idx_api_keys_global', columns: 'is_global' },
        { name: 'idx_api_keys_user_provider', columns: 'user_id, provider_id, is_active' }
      ];
      
      for (const idx of requiredIndexes) {
        if (!indexNames.includes(idx.name)) {
          console.log(`[Migration: 028_fix_api_keys_columns] Adding missing index: ${idx.name}`);
          await db.runAsync(`CREATE INDEX IF NOT EXISTS ${idx.name} ON api_keys(${idx.columns})`);
          results.columnsAdded.push(`INDEX ${idx.name}`);
        }
      }
      
      await db.runAsync('COMMIT');
      
      if (results.columnsAdded.length > 0) {
        console.log(`[Migration: 028_fix_api_keys_columns] Successfully added ${results.columnsAdded.length} missing columns/indexes: ${results.columnsAdded.join(', ')}`);
      } else {
        console.log('[Migration: 028_fix_api_keys_columns] All required columns and indexes already exist');
      }
      
      results.success = true;
      return {
        success: true,
        message: `Fixed ${results.columnsAdded.length} missing columns/indexes in api_keys table`,
        columnsAdded: results.columnsAdded
      };
    } catch (err) {
      await db.runAsync('ROLLBACK');
      console.error('[Migration: 028_fix_api_keys_columns] Error fixing api_keys table columns:', err);
      results.errors.push(err.message);
      throw err;
    }
  } catch (error) {
    console.error('[Migration: 028_fix_api_keys_columns] Error checking or fixing api_keys table:', error);
    return {
      success: false,
      message: `Failed to fix api_keys table: ${error.message}`,
      error
    };
  }
}

module.exports = {
  runMigration: fixApiKeysColumns 
};
