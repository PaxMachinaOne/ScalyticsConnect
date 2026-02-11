// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Special fix for Anthropic API key issues
 * 
 * This module provides fixes for Anthropic API key detection and usage:
 * 1. Ensures global keys are properly marked as global
 * 2. Fixes key lookup and prioritization for Anthropic provider
 * 3. Updates any keys with incorrect encryption flags
 */

const { db } = require('../../models/db');

/**
 * Fix Anthropic API keys
 * 
 * This function performs several critical fixes:
 * - Ensures Anthropic provider exists in the database
 * - Validates global Anthropic keys are properly marked and active
 * - Updates user keys with correct encryption flags
 * 
 * @returns {Promise<Object>} Results of the fix operation
 */
async function fixAnthropicKeys() {
  console.log('[Migration: 026_fix_anthropic_keys] Starting Anthropic key fix process...');
  
  const results = {
    providerFound: false,
    providerCreated: false,
    globalKeysFixed: 0,
    userKeysFixed: 0,
    errors: []
  };
  
  try {
    await db.runAsync('BEGIN TRANSACTION');
    
    let anthropicProvider = await db.getAsync(
      "SELECT id FROM api_providers WHERE name = 'Anthropic'"
    );
    
    if (!anthropicProvider) {
      console.log('[Migration: 026_fix_anthropic_keys] Anthropic provider not found, creating...');
      const result = await db.runAsync(
        `INSERT INTO api_providers (name, description, website, created_at, updated_at)
         VALUES ('Anthropic', 'Provider of Claude AI models', 'https://anthropic.com', datetime('now'), datetime('now'))`
      );
      
      anthropicProvider = { id: result.lastID };
      results.providerCreated = true;
      console.log(`[Migration: 026_fix_anthropic_keys] Created Anthropic provider with ID ${anthropicProvider.id}`);
    } else {
      results.providerFound = true;
      console.log(`[Migration: 026_fix_anthropic_keys] Found existing Anthropic provider with ID ${anthropicProvider.id}`);
    }
    
    console.log('[Migration: 026_fix_anthropic_keys] Checking global Anthropic keys...');
    const globalKeyUpdate = await db.runAsync(
      `UPDATE api_keys
       SET is_global = 1
       WHERE provider_id = ? AND user_id IS NULL`,
      [anthropicProvider.id]
    );
    
    results.globalKeysFixed = globalKeyUpdate.changes;
    console.log(`[Migration: 026_fix_anthropic_keys] Fixed ${globalKeyUpdate.changes} global Anthropic keys`);
    
    console.log('[Migration: 026_fix_anthropic_keys] Validating encryption flags for Anthropic keys...');
    
    const columnsInfo = await db.allAsync("PRAGMA table_info(api_keys)");
    const hasIsEncrypted = columnsInfo.some(col => col.name === 'is_encrypted');
    
    if (!hasIsEncrypted) {
      console.log('[Migration: 026_fix_anthropic_keys] is_encrypted column not found in api_keys table. Adding it...');
      await db.runAsync('ALTER TABLE api_keys ADD COLUMN is_encrypted BOOLEAN DEFAULT 0');
      console.log('[Migration: 026_fix_anthropic_keys] Added is_encrypted column to api_keys table');
    }
    
    console.log('[Migration: 026_fix_anthropic_keys] Finding keys that need encryption flags updated...');
    
    const keysToFix = await db.allAsync(
      `SELECT id, key_value 
       FROM api_keys 
       WHERE provider_id = ? AND key_value LIKE 'sk-%' AND (is_encrypted IS NULL OR is_encrypted = 0)`,
      [anthropicProvider.id]
    );
    
    if (keysToFix.length > 0) {
      console.log(`[Migration: 026_fix_anthropic_keys] Found ${keysToFix.length} Anthropic keys needing encryption flags`);
      
      for (const key of keysToFix) {
        await db.runAsync(
          'UPDATE api_keys SET is_encrypted = 1 WHERE id = ?',
          [key.id]
        );
        results.userKeysFixed++;
      }
      console.log(`[Migration: 026_fix_anthropic_keys] Updated encryption flags for ${results.userKeysFixed} keys`);
    } else {
      console.log('[Migration: 026_fix_anthropic_keys] No Anthropic keys need encryption flag updates');
    }
    
    console.log('[Migration: 026_fix_anthropic_keys] Creating/updating Anthropic key lookup view...');
    
    await db.runAsync(`DROP VIEW IF EXISTS anthropic_keys_view`);
    
    await db.runAsync(`
      CREATE VIEW anthropic_keys_view AS
      SELECT 
        k.id,
        k.provider_id,
        k.user_id,
        COALESCE(k.key_name, 'anthropic_key') as key_name,
        COALESCE(k.key_value, '') as key_value,
        COALESCE(k.is_encrypted, 0) as is_encrypted,
        COALESCE(k.is_active, 1) as is_active,
        COALESCE(k.is_global, 0) as is_global,
        k.created_at,
        k.updated_at,
        p.name as provider_name,
        CASE 
          WHEN COALESCE(k.is_global, 0) = 1 THEN 1
          ELSE 0
        END as priority
      FROM api_keys k
      JOIN api_providers p ON k.provider_id = p.id
      WHERE p.name = 'Anthropic' AND COALESCE(k.is_active, 1) = 1
      ORDER BY priority DESC
    `);
    
    console.log('[Migration: 026_fix_anthropic_keys] Successfully created/updated Anthropic keys view');
    
    await db.runAsync('COMMIT');
    console.log('[Migration: 026_fix_anthropic_keys] Anthropic key fix completed successfully');
    
    return {
      success: true,
      message: 'Anthropic key fix completed successfully',
      results
    };
  } catch (error) {
    try {
      await db.runAsync('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Migration: 026_fix_anthropic_keys] Error during rollback:', rollbackError);
    }
    
    console.error('[Migration: 026_fix_anthropic_keys] Error fixing Anthropic keys:', error);
    
    return {
      success: false,
      message: `Failed to fix Anthropic keys: ${error.message}`,
      error
    };
  }
}

module.exports = {
  runMigration: fixAnthropicKeys
};
