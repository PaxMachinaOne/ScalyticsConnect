// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Group normalization migration
 * 
 * This migration ensures consistent group naming and structure
 * - Standardizes Administrator groups to singular form (Administrator vs Administrators)
 * - Properly sets up permissions for Power Users group
 */

/**
 * Normalize group names and structure to ensure consistency
 * - Keep: Administrator (singular), Power Users
 * - Remove: Administrators (plural)
 * @returns {Promise<void>}
 */
async function normalizeGroups() {
  const { db } = require('../../models/db');
  
  try {
    console.log('[Migration: 031_group_normalization] Starting group normalization');

    // check for and keep Administrator (singular)
    let administratorGroup = await db.getAsync('SELECT id FROM groups WHERE name = ?', ['Administrator']);
    if (!administratorGroup) {
      console.log('[Migration: 031_group_normalization] Creating Administrator group');
      const result = await db.runAsync(
        'INSERT INTO groups (name, description) VALUES (?, ?)',
        ['Administrator', 'Admin access group']
      );
      administratorGroup = { id: result.lastID };
      console.log(`[Migration: 031_group_normalization] Created Administrator group with ID: ${administratorGroup.id}`);
    }

    const powerUsersGroup = await db.getAsync('SELECT id FROM groups WHERE name = ?', ['Power Users']);
    if (!powerUsersGroup) {
      console.log('[Migration: 031_group_normalization] Power Users group not found');
      console.log('[Migration: 031_group_normalization] Group normalization completed');
      return;
    }

    const administratorsGroup = await db.getAsync('SELECT id FROM groups WHERE name = ?', ['Administrators']);
    if (administratorsGroup) {
      console.log('[Migration: 031_group_normalization] Removing Administrators (plural) group');
      await db.runAsync('DELETE FROM groups WHERE id = ?', [administratorsGroup.id]);
      console.log('[Migration: 031_group_normalization] Removed Administrators (plural) group');
    }

    const adminUser = await db.getAsync('SELECT id FROM users WHERE id = 1');
    if (adminUser) {
      const adminMembership = await db.getAsync(
        'SELECT 1 FROM user_groups WHERE user_id = ? AND group_id = ?',
        [adminUser.id, administratorGroup.id]
      );
      
      if (!adminMembership) {
        console.log('[Migration: 031_group_normalization] Adding admin to Administrator group');
        await db.runAsync(
          'INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)',
          [adminUser.id, administratorGroup.id]
        );
      }
    }
    
    if (powerUsersGroup) {
      try {
        console.log('[Migration: 031_group_normalization] Setting up Power Users permissions');
        
        const Permission = require('../../models/Permission');
        const allPermissions = await Permission.getAllPermissions();
        
        if (allPermissions && allPermissions.length > 0) {
          const adminForGrant = await db.getAsync('SELECT id FROM users WHERE is_admin = 1 LIMIT 1');
          const adminId = adminForGrant ? adminForGrant.id : 1;
          
          const excludedPermissions = ['users:manage', 'groups:manage'];
          
          for (const permission of allPermissions) {
            if (excludedPermissions.includes(permission.permission_key)) {
              console.log(`[Migration: 031_group_normalization] Skipping ${permission.name} permission for Power Users`);
              continue;
            }
            
            const hasPermission = await db.getAsync(`
              SELECT EXISTS (
                SELECT 1 FROM group_admin_permissions
                WHERE group_id = ? AND permission_id = ?
              ) as has_permission
            `, [powerUsersGroup.id, permission.id]);
            
            if (hasPermission && hasPermission.has_permission === 1) {
              continue;
            }
            
            await Permission.grantGroupPermission(
              powerUsersGroup.id, 
              permission.id, 
              adminId
            );
            console.log(`[Migration: 031_group_normalization] Granted ${permission.name} to Power Users`);
          }
        }
      } catch (permErr) {
        console.error('[Migration: 031_group_normalization] Error setting up Power Users permissions:', permErr);
      }
    }

    console.log('[Migration: 031_group_normalization] Group normalization completed');
  } catch (error) {
    console.error('[Migration: 031_group_normalization] Error normalizing groups:', error);
  }
}

module.exports = { runMigration: normalizeGroups };
