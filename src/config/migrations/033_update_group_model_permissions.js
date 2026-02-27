// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Group model permissions migration
 * 
 * This module ensures that administrator groups have proper access to all models
 * including those that use API keys. This is a critical fix for situations where
 * global API keys exist but administrators can't access the models.
 */

const { db } = require('../../models/db');

/**
 * Update group model permissions to ensure administrators can access all models
 * 
 * @returns {Promise<Object>} Results of the update operation
 */
async function updateGroupModelPermissions() {
  console.log('[Migration: 033_update_group_model_permissions] Starting group model permissions update...');
  
  const results = {
    adminGroupFound: false,
    adminGroupCreated: false,
    permissionsAdded: 0,
    modelsUpdated: 0,
    errors: []
  };
  
  try {
    await db.runAsync('BEGIN TRANSACTION');
    
    console.log('[Migration: 033_update_group_model_permissions] Ensuring model_group_permissions table exists...');
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS model_group_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
        UNIQUE(model_id, group_id)
      )
    `);
    console.log('[Migration: 033_update_group_model_permissions] model_group_permissions table ready');
    
    let adminGroupRecord = await db.getAsync(
      "SELECT id FROM groups WHERE name = 'Administrator'"
    );
    
    let adminGroup = null;
    if (adminGroupRecord) {
      const adminGroupLink = await db.getAsync(
        "SELECT id FROM user_groups WHERE group_id = ?",
        [adminGroupRecord.id]
      );
      
      if (adminGroupLink) {
        }
    }
    
    if (!adminGroupRecord) {
      console.log('[Migration: 033_update_group_model_permissions] Administrator group not found, creating...');
      const groupResult = await db.runAsync(
        `INSERT INTO groups (name, description, created_at, updated_at)
         VALUES ('Administrator', 'System administrators with full access', datetime('now'), datetime('now'))`
      );
      
      const groupId = groupResult.lastID;
      
      const adminUser = await db.getAsync("SELECT id FROM users WHERE is_admin = 1 LIMIT 1");
      
      if (adminUser) {
        await db.runAsync(
          `INSERT INTO user_groups (user_id, group_id, created_at)
           VALUES (?, ?, datetime('now'))`,
          [adminUser.id, groupId]
        );
      }
      
      adminGroup = { id: groupId };
      results.adminGroupCreated = true;
      console.log(`[Migration: 033_update_group_model_permissions] Created Administrator group with ID ${adminGroup.id}`);
    } else {
      results.adminGroupFound = true;
      console.log(`[Migration: 033_update_group_model_permissions] Found existing Administrator group with ID ${adminGroupRecord.id}`);
    }
    
    const models = await db.allAsync(
      `SELECT id, name, external_provider_id 
       FROM models 
       WHERE is_active = 1`
    );
    
    console.log(`[Migration: 033_update_group_model_permissions] Found ${models.length} active models`);
    
    for (const model of models) {
      const existingPermission = await db.getAsync(
        `SELECT id FROM model_group_permissions 
         WHERE model_id = ? AND group_id = ?`,
        [model.id, adminGroup.id]
      );
      
      if (!existingPermission) {
        await db.runAsync(
          `INSERT INTO model_group_permissions (model_id, group_id, created_at, updated_at)
           VALUES (?, ?, datetime('now'), datetime('now'))`,
          [model.id, adminGroup.id]
        );
        
        results.permissionsAdded++;
        console.log(`[Migration: 033_update_group_model_permissions] Added admin permission for model: ${model.name} (ID: ${model.id})`);
      }
    }
    
    const columnsInfo = await db.allAsync("PRAGMA table_info(models)");
    const hasExternalModelId = columnsInfo.some(col => col.name === 'external_model_id');
    
    console.log('[Migration: 033_update_group_model_permissions] Creating admin model access view...');
    
    try {
      await db.runAsync(`DROP VIEW IF EXISTS admin_model_access_view`);
      
      if (hasExternalModelId) {
        await db.runAsync(`
          CREATE VIEW admin_model_access_view AS
          SELECT 
            m.id AS model_id,
            m.name AS model_name,
            m.description,
            m.model_path,
            m.context_window,
            m.default_system_prompt,
            m.external_provider_id,
            m.external_model_id,
            m.created_at,
            m.updated_at,
            g.id AS group_id,
            grp.name AS group_name
          FROM models m
          CROSS JOIN groups grp
          JOIN user_groups g ON g.group_id = grp.id
          WHERE grp.name = 'Administrator' 
          AND m.is_active = 1
        `);
      } else {
        await db.runAsync(`
          CREATE VIEW admin_model_access_view AS
          SELECT 
            m.id AS model_id,
            m.name AS model_name,
            m.description,
            m.model_path,
            m.context_window,
            m.default_system_prompt,
            m.external_provider_id,
            m.created_at,
            m.updated_at,
            g.id AS group_id,
            grp.name AS group_name
          FROM models m
          CROSS JOIN groups grp
          JOIN user_groups g ON g.group_id = grp.id
          WHERE grp.name = 'Administrator' 
          AND m.is_active = 1
        `);
      }
      
      console.log('[Migration: 033_update_group_model_permissions] Successfully created admin model access view');
    } catch (viewError) {
      console.warn('[Migration: 033_update_group_model_permissions] Warning: Could not create admin model access view:', viewError.message);
      results.errors.push(`View creation error: ${viewError.message}`);
    }
    
    console.log('[Migration: 033_update_group_model_permissions] Checking for models with missing provider IDs...');
    
    try {
      const openAIProvider = await db.getAsync("SELECT id FROM api_providers WHERE name = 'OpenAI' LIMIT 1");
      
      if (openAIProvider) {
        console.log('[Migration: 033_update_group_model_permissions] Found OpenAI provider, using as default for models with missing provider');
        
        const modelUpdates = await db.runAsync(`
          UPDATE models
          SET external_provider_id = ?
          WHERE external_provider_id IS NULL
          AND model_path LIKE '%/'
        `, [openAIProvider.id]);
        
        results.modelsUpdated = modelUpdates.changes;
        console.log(`[Migration: 033_update_group_model_permissions] Updated ${modelUpdates.changes} models with default OpenAI provider ID`);
      } else {
        console.log('[Migration: 033_update_group_model_permissions] OpenAI provider not found, skipping provider ID updates');
      }
    } catch (providerError) {
      console.warn('[Migration: 033_update_group_model_permissions] Error updating provider IDs:', providerError.message);
      results.errors.push(`Provider ID update error: ${providerError.message}`);
    }
    
    await db.runAsync('COMMIT');
    console.log('[Migration: 033_update_group_model_permissions] Group model permissions update completed successfully');
    
    return {
      success: true,
      message: 'Group model permissions update completed successfully',
      results
    };
  } catch (error) {
    await db.runAsync('ROLLBACK');
    console.error('[Migration: 033_update_group_model_permissions] Error updating group model permissions:', error);
    
    return {
      success: false,
      message: `Failed to update group model permissions: ${error.message}`,
      error
    };
  }
}

module.exports = {
  runMigration: updateGroupModelPermissions 
};
