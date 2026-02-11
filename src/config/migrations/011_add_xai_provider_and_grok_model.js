// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); 

module.exports = {
  async up() {
    console.log('Applying migration 011_add_xai_provider_and_grok_model.js: Up');
    try {
      await db.runAsync('BEGIN TRANSACTION;');

      const providerResult = await db.runAsync(
        `INSERT OR IGNORE INTO api_providers (name, api_url, endpoints, category, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%S', 'now'), strftime('%Y-%m-%d %H:%M:%S', 'now'))`,
        ['xAI', 'https://api.x.ai', '{"chat":"/v1/chat/completions"}', 'Chat', 1]
      );

      let xaiProviderId = providerResult.lastID;
      // If IGNORE happened, lastID might be 0 or undefined depending on driver behavior for IGNORE.
      // So, we fetch the ID to be sure.
      if (!xaiProviderId || xaiProviderId === 0) {
        const existingProvider = await db.getAsync("SELECT id FROM api_providers WHERE name = ?", ['xAI']);
        if (existingProvider) {
          xaiProviderId = existingProvider.id;
          console.log(`Found existing xAI provider with ID: ${xaiProviderId} (INSERT IGNORED).`);
        } else {
          // This case should ideally not happen if INSERT OR IGNORE was meant to succeed or ignore.
          // If it's null here, it means the provider wasn't there and INSERT OR IGNORE failed to return a lastID,
          // which is unexpected.
          throw new Error('Failed to insert or find xAI provider after INSERT OR IGNORE.');
        }
      } else {
        console.log(`Inserted xAI provider with ID: ${xaiProviderId}`);
      }
      
      if (!xaiProviderId) { 
        throw new Error('Could not obtain xAI provider ID.');
      }

      await db.runAsync('COMMIT;');
      console.log('Migration 011 (add xAI provider) applied successfully.');
    } catch (error) {
      await db.runAsync('ROLLBACK;');
      console.error('Error applying migration 011_add_xai_provider_and_grok_model.js (up):', error);
      throw error;
    }
  },

  async down() {
    console.log('Reverting migration 011_add_xai_provider_and_grok_model.js: Down');
    try {
      await db.runAsync('BEGIN TRANSACTION;');

      const xaiProvider = await db.getAsync("SELECT id FROM api_providers WHERE name = ?", ['xAI']);

      if (!xaiProvider) {
        console.warn("xAI provider not found during revert. Nothing to delete from api_providers.");
      }

      const deleteProviderResult = await db.runAsync("DELETE FROM api_providers WHERE name = ?", ['xAI']);
      console.log(`Deleted ${deleteProviderResult.changes} xAI provider(s).`);

      await db.runAsync('COMMIT;');
      console.log('Migration 011 reverted successfully.');
    } catch (error) {
      await db.runAsync('ROLLBACK;');
      console.error('Error reverting migration 011_add_xai_provider_and_grok_model.js (down):', error);
      throw error;
    }
  }
};
