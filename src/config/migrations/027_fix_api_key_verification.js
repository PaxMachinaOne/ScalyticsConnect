// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * General API key verification fix
 * 
 * This module addresses general issues with API key verification:
 * 1. Ensures that all providers have their global keys properly marked
 * 2. Validates that the database has proper indexes for API key lookup
 * 3. Fixes any encryption flags or key format issues
 */

const { db } = require('../../models/db');

/**
 * Fix API key verification issues
 * 
 * @returns {Promise<Object>} Results of the fix operation
 */
async function fixApiKeyVerification() {
  console.log('[Migration: 027_fix_api_key_verification] Starting general API key verification fix...');
  
  const results = {
    providersChecked: 0,
    globalKeysFixed: 0,
    userKeysFixed: 0,
    indexesCreated: 0,
    columnsAdded: 0,
    errors: []
  };
  
  try {
    const tableExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
    );
    
    if (!tableExists) {
      console.log('[Migration: 027_fix_api_key_verification] api_keys table does not exist, nothing to fix for verification.');
      return {
        success: true,
        message: 'api_keys table does not exist yet, verification will be handled during table creation'
      };
    }
    
    await db.runAsync('BEGIN TRANSACTION');
    
    try {
      const columnsInfo = await db.allAsync("PRAGMA table_info(api_keys)");
      const columnNames = columnsInfo.map(col => col.name);
      console.log(`[Migration: 027_fix_api_key_verification] Existing api_keys columns: ${columnNames.join(', ')}`);
      
      const hasIsEncrypted = columnNames.includes('is_encrypted');
      const hasIsGlobal = columnNames.includes('is_global');
      const hasIsActive = columnNames.includes('is_active');
      const hasKeyName = columnNames.includes('key_name');
      const hasKeyValue = columnNames.includes('key_value');
      
      if (!hasIsEncrypted) {
        console.log('[Migration: 027_fix_api_key_verification] Adding is_encrypted column...');
        await db.runAsync('ALTER TABLE api_keys ADD COLUMN is_encrypted BOOLEAN DEFAULT 0');
        console.log('[Migration: 027_fix_api_key_verification] Added is_encrypted column');
        results.columnsAdded++;
      }
      
      if (!hasIsGlobal) {
        console.log('[Migration: 027_fix_api_key_verification] Adding is_global column...');
        await db.runAsync('ALTER TABLE api_keys ADD COLUMN is_global BOOLEAN DEFAULT 0');
        console.log('[Migration: 027_fix_api_key_verification] Added is_global column');
        results.columnsAdded++;
      }
      
      if (!hasIsActive) {
        console.log('[Migration: 027_fix_api_key_verification] Adding is_active column...');
        await db.runAsync('ALTER TABLE api_keys ADD COLUMN is_active BOOLEAN DEFAULT 1');
        console.log('[Migration: 027_fix_api_key_verification] Added is_active column');
        results.columnsAdded++;
      }
      
      if (!hasKeyName) {
        console.log('[Migration: 027_fix_api_key_verification] Adding key_name column...');
        await db.runAsync("ALTER TABLE api_keys ADD COLUMN key_name TEXT NOT NULL DEFAULT ''");
        console.log('[Migration: 027_fix_api_key_verification] Added key_name column');
        results.columnsAdded++;
      }
      
      if (!hasKeyValue) {
        console.log('[Migration: 027_fix_api_key_verification] Adding key_value column...');
        await db.runAsync("ALTER TABLE api_keys ADD COLUMN key_value TEXT NOT NULL DEFAULT ''");
        console.log('[Migration: 027_fix_api_key_verification] Added key_value column');
        results.columnsAdded++;
      }
      
      console.log('[Migration: 027_fix_api_key_verification] Getting all API providers...');
      const providers = await db.allAsync('SELECT id, name FROM api_providers');
      results.providersChecked = providers.length;
      
      console.log(`[Migration: 027_fix_api_key_verification] Found ${providers.length} API providers to check`);
      
      for (const provider of providers) {
        console.log(`[Migration: 027_fix_api_key_verification] Checking keys for provider: ${provider.name} (ID: ${provider.id})`);
        
        const globalKeyUpdate = await db.runAsync(
          `UPDATE api_keys
           SET is_global = 1
           WHERE provider_id = ? AND (user_id IS NULL OR user_id = 0)`,
          [provider.id]
        );
        
        results.globalKeysFixed += globalKeyUpdate.changes;
        
        if (globalKeyUpdate.changes > 0) {
          console.log(`[Migration: 027_fix_api_key_verification] Fixed ${globalKeyUpdate.changes} global keys for ${provider.name}`);
        } else {
          console.log(`[Migration: 027_fix_api_key_verification] No global keys needed fixing for ${provider.name}`);
        }
      }
      
      console.log('[Migration: 027_fix_api_key_verification] Adding database indexes for API key lookup...');
      
      try {
        const existingIndexes = await db.allAsync(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_keys'"
        );
        const indexNames = existingIndexes.map(idx => idx.name);
        
        if (!indexNames.includes('idx_api_keys_user_provider')) {
          await db.runAsync(
            `CREATE INDEX IF NOT EXISTS idx_api_keys_user_provider 
             ON api_keys (user_id, provider_id, COALESCE(is_active, 1))`
          );
          results.indexesCreated++;
          console.log('[Migration: 027_fix_api_key_verification] Created idx_api_keys_user_provider index');
        }
        
        if (!indexNames.includes('idx_api_keys_global')) {
          await db.runAsync(
            `CREATE INDEX IF NOT EXISTS idx_api_keys_global 
             ON api_keys (provider_id, COALESCE(is_global, 0), COALESCE(is_active, 1))`
          );
          results.indexesCreated++;
          console.log('[Migration: 027_fix_api_key_verification] Created idx_api_keys_global index');
        }
        
        if (!indexNames.includes('idx_api_keys_provider')) {
          await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id)`);
          results.indexesCreated++;
          console.log('[Migration: 027_fix_api_key_verification] Created idx_api_keys_provider index');
        }
        
        if (!indexNames.includes('idx_api_keys_user')) {
          await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
          results.indexesCreated++;
          console.log('[Migration: 027_fix_api_key_verification] Created idx_api_keys_user index');
        }
        
        if (results.indexesCreated > 0) {
          console.log(`[Migration: 027_fix_api_key_verification] Added ${results.indexesCreated} indexes for API key lookup`);
        } else {
          console.log('[Migration: 027_fix_api_key_verification] All required indexes already exist');
        }
      } catch (indexError) {
        console.warn('[Migration: 027_fix_api_key_verification] Warning: Could not create indexes:', indexError.message);
        results.errors.push(`Index creation error: ${indexError.message}`);
      }
      
      console.log('[Migration: 027_fix_api_key_verification] Validating encryption flags for all API keys...');
      
      try {
        const keysToFix = await db.allAsync(`
          SELECT id 
          FROM api_keys 
          WHERE (is_encrypted IS NULL OR is_encrypted = 0) 
          AND (
            key_value LIKE 'sk-%' OR 
            key_value LIKE 'co--%' OR
            LENGTH(key_value) > 30
          )
        `);
        
        if (keysToFix.length > 0) {
          console.log(`[Migration: 027_fix_api_key_verification] Found ${keysToFix.length} API keys needing encryption flags`);
          
          for (const key of keysToFix) {
            await db.runAsync(
              'UPDATE api_keys SET is_encrypted = 1 WHERE id = ?',
              [key.id]
            );
            results.userKeysFixed++;
          }
          
          console.log(`[Migration: 027_fix_api_key_verification] Updated encryption flags for ${results.userKeysFixed} API keys`);
        } else {
          console.log('[Migration: 027_fix_api_key_verification] No API keys need encryption flag updates');
        }
      } catch (encryptionError) {
        console.warn('[Migration: 027_fix_api_key_verification] Warning: Issue updating encryption flags:', encryptionError.message);
        results.errors.push(`Encryption flag update error: ${encryptionError.message}`);
      }
      
      await db.runAsync('COMMIT');
      console.log('[Migration: 027_fix_api_key_verification] API key verification fix completed successfully');
      
      return {
        success: true,
        message: 'API key verification fix completed successfully',
        results: {
          providersChecked: results.providersChecked,
          globalKeysFixed: results.globalKeysFixed,
          userKeysFixed: results.userKeysFixed,
          indexesCreated: results.indexesCreated,
          columnsAdded: results.columnsAdded,
          errors: results.errors
        }
      };
    } catch (error) {
      try {
        await db.runAsync('ROLLBACK');
      } catch (rollbackError) {
        console.error('[Migration: 027_fix_api_key_verification] Error during rollback:', rollbackError);
      }
      
      throw error;
    }
  } catch (error) {
    console.error('[Migration: 027_fix_api_key_verification] Error fixing API key verification:', error);
    
    return {
      success: false,
      message: `Failed to fix API key verification: ${error.message}`,
      error
    };
  }
}

module.exports = {
  runMigration: fixApiKeyVerification 
};
