// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../models/db');
const User = require('../models/User');
const Model = require('../models/Model');

/**
 * Get all groups
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getGroups = async (req, res) => {
  try {
    const groups = await db.allAsync(`
      SELECT g.*, 
        (SELECT COUNT(*) FROM user_groups WHERE group_id = g.id) as userCount
      FROM groups g
      ORDER BY g.name ASC
    `);

    // Wrap groups in data property
    res.status(200).json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching groups'
    });
  }
};

/**
 * Get a single group with its users
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getGroup = async (req, res) => {
  try {
    const { id } = req.params;

    // Get group details
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [id]);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Get users assigned to this group
    const users = await db.allAsync(`
      SELECT u.id, u.username, u.email, u.is_admin, u.created_at
      FROM users u
      JOIN user_groups ug ON u.id = ug.user_id
      WHERE ug.group_id = ?
      ORDER BY u.username ASC
    `, [id]);

    // Get model access count for this group
    const modelAccessCountResult = await db.getAsync(
      'SELECT COUNT(*) as count FROM group_model_access WHERE group_id = ? AND can_access = 1',
      [id]
    );
    const modelAccessCount = modelAccessCountResult ? modelAccessCountResult.count : 0;

    // Get permissions count for this group
    // Assuming 'group_admin_permissions' is the correct table for group-specific permissions
    const permissionCountResult = await db.getAsync(
      'SELECT COUNT(*) as count FROM group_admin_permissions WHERE group_id = ?',
      [id]
    );
    const permissionCount = permissionCountResult ? permissionCountResult.count : 0;

    res.status(200).json({
      success: true,
      data: {
        id: group.id,
        name: group.name,
        description: group.description,
        created_at: group.created_at,
        updated_at: group.updated_at,
        users,
        user_count: users.length, // Frontend expects user_count
        model_access_count: modelAccessCount, // Frontend expects model_access_count
        permission_count: permissionCount // Frontend expects permission_count
      }
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching group details'
    });
  }
};

/**
 * Create a new group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.createGroup = async (req, res) => {
  try {
    const { name, description } = req.body;

    // Validate input
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }

    // Check if group already exists
    const existingGroup = await db.getAsync('SELECT * FROM groups WHERE name = ?', [name]);
    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: 'Group with that name already exists'
      });
    }

    // Create the group
    const result = await db.runAsync(
      'INSERT INTO groups (name, description) VALUES (?, ?)',
      [name, description || '']
    );

    const newGroup = await db.getAsync('SELECT * FROM groups WHERE id = ?', [result.lastID]);

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: newGroup
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating group'
    });
  }
};

/**
 * Update a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Validate input
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Prevent renaming Power Users group
    if (group.name === 'Power Users' && name !== 'Power Users') {
      return res.status(403).json({
        success: false,
        message: 'The Power Users group cannot be renamed as it is a system group'
      });
    }

    // Check if another group with the same name exists
    const existingGroup = await db.getAsync('SELECT * FROM groups WHERE name = ? AND id != ?', [name, id]);
    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: 'Another group with that name already exists'
      });
    }

    // Update the group
    await db.runAsync(
      'UPDATE groups SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [name, description || '', id]
    );

    const updatedGroup = await db.getAsync('SELECT * FROM groups WHERE id = ?', [id]);

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: updatedGroup
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating group'
    });
  }
};

/**
 * Delete a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [id]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }
    
    // Prevent deletion of Administrator group
    if (group.name === 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'The Administrator group cannot be deleted as it is a system group'
      });
    }

    // Check if there are any users assigned to this group
    const userCount = await db.getAsync('SELECT COUNT(*) as count FROM user_groups WHERE group_id = ?', [id]);
    if (userCount && userCount.count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete group. It contains ${userCount.count} users. Remove all users first.`
      });
    }

    // Delete the group
    await db.runAsync('DELETE FROM groups WHERE id = ?', [id]);

    // Delete any model access settings for this group
    try {
      await db.runAsync('DELETE FROM group_model_access WHERE group_id = ?', [id]);
    } catch (err) {
      // If table doesn't exist yet, ignore error
      console.log('group_model_access table may not exist yet');
    }

    res.status(200).json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting group'
    });
  }
};

/**
 * Assign a user to a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.assignUserToGroup = async (req, res) => {
  try {
    const { userId } = req.params;
    const { groupId } = req.body;

    // Check if user and group exist
    const user = await User.findById(userId);
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);

    if (!user || !group) {
      return res.status(404).json({
        success: false,
        message: 'User or group not found'
      });
    }

    // Check if user is already assigned to the group
    const existingAssignment = await db.getAsync(
      'SELECT * FROM user_groups WHERE user_id = ? AND group_id = ?',
      [userId, groupId]
    );

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'User is already assigned to the group'
      });
    }

    // Assign user to group
    await db.runAsync(
      'INSERT INTO user_groups (user_id, group_id) VALUES (?, ?)',
      [userId, groupId]
    );

    res.status(200).json({
      success: true,
      message: 'User assigned to group successfully'
    });
  } catch (error) {
    console.error('Assign user to group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning user to group'
    });
  }
};

/**
 * Remove a user from a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.removeUserFromGroup = async (req, res) => {
  try {
    const { userId, groupId } = req.params;

    // Check if user and group exist
    const user = await User.findById(userId);
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);

    if (!user || !group) {
      return res.status(404).json({
        success: false,
        message: 'User or group not found'
      });
    }
    
    // Prevent removing admin user from Administrator group
    if (user.id === 1 && group.name === 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'The system administrator cannot be removed from the Administrator group'
      });
    }

    // Check if user is assigned to the group
    const assignment = await db.getAsync(
      'SELECT * FROM user_groups WHERE user_id = ? AND group_id = ?',
      [userId, groupId]
    );

    if (!assignment) {
      return res.status(400).json({
        success: false,
        message: 'User is not assigned to the group'
      });
    }

    // Remove user from group
    await db.runAsync(
      'DELETE FROM user_groups WHERE user_id = ? AND group_id = ?',
      [userId, groupId]
    );

    res.status(200).json({
      success: true,
      message: 'User removed from group successfully'
    });
  } catch (error) {
    console.error('Remove user from group error:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing user from group'
    });
  }
};

/**
 * Get model access for a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getGroupModelAccess = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if group_model_access table exists
    let hasAccessTable = false;
    try {
      await db.getAsync('SELECT 1 FROM group_model_access LIMIT 1');
      hasAccessTable = true;
    } catch (err) {
      // Table doesn't exist yet
      console.log('group_model_access table does not exist yet');
    }

    let modelAccess = [];

    if (hasAccessTable) {
      // Get group's model access
      modelAccess = await db.allAsync(`
        SELECT 
          m.id as model_id, 
          m.name as model_name,
          m.external_provider_id,
          ap.name as provider_name,
          gma.can_access
        FROM models m
        LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
        LEFT JOIN group_model_access gma ON gma.model_id = m.id AND gma.group_id = ?
        WHERE m.is_active = 1
        ORDER BY ap.name, m.name
      `, [groupId]);
    } else {
      // If table doesn't exist, return all active models as accessible
      modelAccess = await db.allAsync(`
        SELECT 
          m.id as model_id, 
          m.name as model_name,
          m.external_provider_id,
          ap.name as provider_name,
          1 as can_access
        FROM models m
        LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
        WHERE m.is_active = 1
        ORDER BY ap.name, m.name
      `);
    }

    // Group by provider
    const groupedAccess = modelAccess.reduce((acc, model) => {
      const providerName = model.provider_name || 'Local';

      if (!acc[providerName]) {
        acc[providerName] = [];
      }

      acc[providerName].push({
        id: model.model_id,
        name: model.model_name,
        can_access: Boolean(model.can_access)
      });

      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: groupedAccess
    });
  } catch (error) {
    console.error('Get group model access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting group model access'
    });
  }
};

/**
 * Get user's model access with group information
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getUserModelAccessWithGroups = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if user exists
    const user = await db.getAsync('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get user's groups
    const userGroups = await db.allAsync(`
      SELECT g.id, g.name
      FROM groups g
      JOIN user_groups ug ON g.id = ug.group_id
      WHERE ug.user_id = ?
    `, [userId]);
    
    // If user has no groups, return empty result
    if (userGroups.length === 0) {
      return res.status(200).json({
        success: true,
        data: {},
        userGroups: []
      });
    }
    
    // Get model access through groups
    const modelAccess = await db.allAsync(`
      SELECT DISTINCT
        m.id as model_id,
        m.name as model_name,
        ap.name as provider_name,
        g.id as group_id,
        g.name as group_name,
        gma.can_access
      FROM models m
      LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
      JOIN group_model_access gma ON gma.model_id = m.id
      JOIN groups g ON gma.group_id = g.id
      JOIN user_groups ug ON ug.group_id = g.id
      WHERE ug.user_id = ? AND m.is_active = 1 AND gma.can_access = 1
      ORDER BY ap.name, m.name
    `, [userId]);

    // Group by provider and model, including all groups that grant access
    const groupedAccess = {};
    
    for (const item of modelAccess) {
      const providerName = item.provider_name || 'Local';
      
      if (!groupedAccess[providerName]) {
        groupedAccess[providerName] = [];
      }
      
      // Find if we already added this model
      let model = groupedAccess[providerName].find(m => m.id === item.model_id);
      
      if (!model) {
        // Add new model entry
        model = {
          id: item.model_id,
          name: item.model_name,
          can_access: true,
          groups: []
        };
        groupedAccess[providerName].push(model);
      }
      
      // Check if this group is already in the model's groups array
      const groupExists = model.groups.some(g => g.id === item.group_id);
      
      // If not, add the group
      if (!groupExists) {
        model.groups.push({
          id: item.group_id,
          name: item.group_name
        });
      }
    }

    res.status(200).json({
      success: true,
      data: groupedAccess,
      userGroups: userGroups
    });
  } catch (error) {
    console.error('Get user model access error:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting user model access'
    });
  }
};

/**
 * Update model access for a group
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.updateGroupModelAccess = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { modelId, canAccess } = req.body;

    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: 'Model ID is required'
      });
    }

    if (canAccess === undefined) {
      return res.status(400).json({
        success: false,
        message: 'canAccess parameter is required'
      });
    }

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if model exists
    const model = await db.getAsync('SELECT id FROM models WHERE id = ?', [modelId]);
    if (!model) {
      return res.status(404).json({
        success: false,
        message: 'Model not found'
      });
    }

    // Create group_model_access table if it doesn't exist
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS group_model_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        can_access BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
        UNIQUE(group_id, model_id)
      )
    `);

    // Check if group already has an access entry for this model
    const existingAccess = await db.getAsync(
      'SELECT id FROM group_model_access WHERE group_id = ? AND model_id = ?',
      [groupId, modelId]
    );

    if (existingAccess) {
      // Update existing access
      await db.runAsync(
        'UPDATE group_model_access SET can_access = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [canAccess ? 1 : 0, existingAccess.id]
      );
    } else {
      // Create new access entry
      await db.runAsync(
        'INSERT INTO group_model_access (group_id, model_id, can_access) VALUES (?, ?, ?)',
        [groupId, modelId, canAccess ? 1 : 0]
      );
    }

    // If this is a permission removal, we need to check if any users have access via this group
    // and update their direct permissions accordingly
    if (!canAccess) {
      // First, get all users in this group
      const groupUsers = await db.allAsync(
        'SELECT user_id FROM user_groups WHERE group_id = ?',
        [groupId]
      );

      // For each user, check if they have an individual permission for this model
      // If not, we need to ensure they can't access it
      for (const { user_id } of groupUsers) {
        const userAccess = await db.getAsync(
          'SELECT id, can_access FROM user_model_access WHERE user_id = ? AND model_id = ?',
          [user_id, modelId]
        );

        if (!userAccess) {
          // User doesn't have a direct permission, add one that denies access
          await db.runAsync(
            'INSERT INTO user_model_access (user_id, model_id, can_access) VALUES (?, ?, 0)',
            [user_id, modelId]
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Group model access updated successfully',
      data: {
        groupId,
        modelId,
        canAccess: Boolean(canAccess)
      }
    });
  } catch (error) {
    console.error('Error updating group model access:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating group model access'
    });
  }
};

/**
 * Reset model access settings for a group to defaults
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.resetGroupModelAccess = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Get default models from providers
    const defaultModels = [];

    // Import the provider manager to get default models
    const providerManager = require('../services/providers');

    // Get all providers
    const providers = Object.values(providerManager.getAllProviders());

    // Get default models for each provider
    for (const provider of providers) {
      const models = provider.getDefaultModels();
      if (models && models.length > 0) {
        for (const model of models) {
          defaultModels.push(model);
        }
      }
    }

    // Create group_model_access table if it doesn't exist
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS group_model_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        can_access BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
        UNIQUE(group_id, model_id)
      )
    `);

    // Get all models
    const allModels = await db.allAsync(`
      SELECT m.id, m.name, m.external_model_id, ap.name as provider_name
      FROM models m
      LEFT JOIN api_providers ap ON m.external_provider_id = ap.id
      WHERE m.is_active = 1
    `);

    // Clear all existing group model access entries
    await db.runAsync('DELETE FROM group_model_access WHERE group_id = ?', [groupId]);

    // Set defaults - if model is in defaultModels, allow access; otherwise deny
    let enabledCount = 0;
    let disabledCount = 0;

    for (const model of allModels) {
      const isDefaultModel = defaultModels.some(dm =>
        (dm.id && model.external_model_id === dm.id) ||
        (dm.name && model.name.includes(dm.name))
      );

      await db.runAsync(
        'INSERT INTO group_model_access (group_id, model_id, can_access) VALUES (?, ?, ?)',
        [groupId, model.id, isDefaultModel ? 1 : 0]
      );

      if (isDefaultModel) {
        enabledCount++;
      } else {
        disabledCount++;
      }
    }

    // Update affected users' permissions
    // Get all users in this group
    const groupUsers = await db.allAsync(
      'SELECT user_id FROM user_groups WHERE group_id = ?',
      [groupId]
    );

    // For each user, update their direct model access
    const affectedUsers = groupUsers.length;

    res.status(200).json({
      success: true,
      message: `Group model access reset successfully. ${enabledCount} models enabled, ${disabledCount} models disabled.`,
      data: {
        enabledModels: enabledCount,
        disabledModels: disabledCount,
        affectedUsers
      }
    });
  } catch (error) {
    console.error('Error resetting group model access:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting group model access'
    });
  }
};

/**
 * Reset model access for a specific provider
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.resetGroupProviderModelAccess = async (req, res) => {
  try {
    const { groupId, providerId } = req.params;

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if provider exists
    const provider = await db.getAsync('SELECT * FROM api_providers WHERE id = ?', [providerId]);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    // providerManager is now at top level

    // Get provider object
    const providerObject = providerManager.getProvider(provider.name);
    if (!providerObject) {
      return res.status(404).json({
        success: false,
        message: `Provider ${provider.name} not found in provider manager`
      });
    }

    // Get default models for this provider
    const defaultModels = providerObject.getDefaultModels() || [];

    // Create group_model_access table if it doesn't exist
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS group_model_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        can_access BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
        UNIQUE(group_id, model_id)
      )
    `);

    // Get all models for this provider
    const providerModels = await db.allAsync(`
      SELECT m.id, m.name, m.external_model_id 
      FROM models m
      WHERE m.external_provider_id = ? AND m.is_active = 1
    `, [providerId]);

    // Reset access for this provider's models
    let enabledCount = 0;
    let disabledCount = 0;

    for (const model of providerModels) {
      const isDefaultModel = defaultModels.some(dm =>
        (dm.id && model.external_model_id === dm.id) ||
        (dm.name && model.name.includes(dm.name))
      );

      // Check if group already has an access entry for this model
      const existingAccess = await db.getAsync(
        'SELECT id FROM group_model_access WHERE group_id = ? AND model_id = ?',
        [groupId, model.id]
      );

      if (existingAccess) {
        // Update existing access
        await db.runAsync(
          'UPDATE group_model_access SET can_access = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [isDefaultModel ? 1 : 0, existingAccess.id]
        );
      } else {
        // Create new access entry
        await db.runAsync(
          'INSERT INTO group_model_access (group_id, model_id, can_access) VALUES (?, ?, ?)',
          [groupId, model.id, isDefaultModel ? 1 : 0]
        );
      }

      if (isDefaultModel) {
        enabledCount++;
      } else {
        disabledCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `${provider.name} model access reset successfully. ${enabledCount} models enabled, ${disabledCount} models disabled.`,
      data: {
        provider: provider.name,
        enabledModels: enabledCount,
        disabledModels: disabledCount
      }
    });
  } catch (error) {
    console.error('Error resetting provider model access:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting provider model access'
    });
  }
};

/**
 * Copy group permissions to a user
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.copyGroupPermissionsToUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if group exists
    const group = await db.getAsync('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Create user_model_access table if it doesn't exist
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS user_model_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        can_access BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
        UNIQUE(user_id, model_id)
      )
    `);

    // Create group_model_access table if it doesn't exist
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS group_model_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        can_access BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
        UNIQUE(group_id, model_id)
      )
    `);

    // Get all group's model access settings
    const groupModelAccess = await db.allAsync(`
      SELECT model_id, can_access
      FROM group_model_access
      WHERE group_id = ?
    `, [groupId]);

    // Apply group permissions to user
    let updatedCount = 0;
    let addedCount = 0;

    for (const { model_id, can_access } of groupModelAccess) {
      // Check if user already has access setting for this model
      const existingAccess = await db.getAsync(
        'SELECT id FROM user_model_access WHERE user_id = ? AND model_id = ?',
        [userId, model_id]
      );

      if (existingAccess) {
        // Update existing access
        await db.runAsync(
          'UPDATE user_model_access SET can_access = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [can_access, existingAccess.id]
        );
        updatedCount++;
      } else {
        // Create new access entry
        await db.runAsync(
          'INSERT INTO user_model_access (user_id, model_id, can_access) VALUES (?, ?, ?)',
          [userId, model_id, can_access]
        );
        addedCount++;
      }
    }

    res.status(200).json({
      success: true,
      message: `Group permissions copied to user successfully. ${updatedCount} permissions updated, ${addedCount} permissions added.`,
      data: {
        totalPermissions: groupModelAccess.length,
        updatedPermissions: updatedCount,
        addedPermissions: addedCount
      }
    });
  } catch (error) {
    console.error('Error copying group permissions to user:', error);
    res.status(500).json({
      success: false,
      message: 'Error copying group permissions to user'
    });
  }
};
