// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db');

const MIGRATION_NAME = '014_update_xai_provider_details';

module.exports = {
  async up() {
    console.log(`\nRunning migration ${MIGRATION_NAME}: Updating xAI provider endpoints and description...`);
    try {
      await db.runAsync('BEGIN TRANSACTION;');

      const xaiProvider = await db.getAsync("SELECT id, endpoints, description FROM api_providers WHERE name = ?", ['xAI']);

      if (xaiProvider) {
        let currentEndpoints = {};
        if (xaiProvider.endpoints) {
          try {
            currentEndpoints = JSON.parse(xaiProvider.endpoints);
          } catch (e) {
            console.warn(`- xAI provider (ID: ${xaiProvider.id}) has invalid JSON in endpoints: ${xaiProvider.endpoints}. This will be overwritten.`);
            if (typeof xaiProvider.endpoints === 'string' && xaiProvider.endpoints.includes('"chat"')) {
                currentEndpoints = { chat: "/v1/chat/completions" }; 
            } else {
                currentEndpoints = {};
            }
          }
        }

        const targetEndpoints = {
          ...currentEndpoints, 
          chat: currentEndpoints.chat || "/v1/chat/completions", 
          models: "/v1/models" 
        };
        const newEndpointsJson = JSON.stringify(targetEndpoints);

        const newDescription = xaiProvider.description || 'Provider for xAI Grok models.'; 

        if (xaiProvider.endpoints !== newEndpointsJson || xaiProvider.description !== newDescription) {
          const result = await db.runAsync(
            `UPDATE api_providers 
             SET 
               endpoints = ?, 
               description = ?,
               updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
             WHERE name = ?`,
            [newEndpointsJson, newDescription, 'xAI']
          );
          if (result.changes > 0) {
            console.log(`- Updated xAI provider (ID: ${xaiProvider.id}). Endpoints: ${newEndpointsJson}, Description: "${newDescription}"`);
          } else {
            console.log('- xAI provider found, but no changes were applied (possibly data already up-to-date or update failed silently).');
          }
        } else {
          console.log('- xAI provider found and already has the correct endpoints and description.');
        }
      } else {
        console.warn('- xAI provider not found. Skipping update. It might be added by a different migration.');
      }

      await db.runAsync('COMMIT;');
      console.log(`Migration ${MIGRATION_NAME} (up) completed successfully.`);
    } catch (err) {
      await db.runAsync('ROLLBACK;');
      console.error(`Error applying migration ${MIGRATION_NAME} (up):`, err);
      throw err;
    }
  },

  async down() {
    console.log(`\nReverting migration ${MIGRATION_NAME}: Attempting to revert xAI provider endpoints and description...`);
    try {
      await db.runAsync('BEGIN TRANSACTION;');
      const xaiProvider = await db.getAsync("SELECT id, description FROM api_providers WHERE name = ?", ['xAI']);

      if (xaiProvider) {
        const originalEndpoints = JSON.stringify({ chat: "/v1/chat/completions" });
        const originalDescription = (xaiProvider.description === 'Provider for xAI Grok models.') ? null : xaiProvider.description;

        const result = await db.runAsync(
          `UPDATE api_providers 
           SET 
             endpoints = ?,
             description = ?,
             updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
           WHERE name = ?`,
          [originalEndpoints, originalDescription, 'xAI']
        );
        if (result.changes > 0) {
          console.log(`- Reverted xAI provider (ID: ${xaiProvider.id}) endpoints to ${originalEndpoints} and description.`);
        } else {
          console.log('- xAI provider found but no changes were applied during revert.');
        }
      } else {
        console.warn('- xAI provider not found during revert. Nothing to do.');
      }

      await db.runAsync('COMMIT;');
      console.log(`Migration ${MIGRATION_NAME} (down) completed successfully.`);
    } catch (err) {
      await db.runAsync('ROLLBACK;');
      console.error(`Error reverting migration ${MIGRATION_NAME} (down):`, err);
      throw err;
    }
  }
};
