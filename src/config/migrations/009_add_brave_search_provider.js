// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); // Import db instance

/**
 * Migration: 009_add_brave_search_provider
 *
 * Adds the Brave Search provider to the api_providers table.
 */
module.exports = {
  // Remove db parameter from signature
  up: async () => {
    console.log('\nRunning migration 009_add_brave_search_provider: Adding Brave Search provider...');
    try {
      // Check if Brave Search provider already exists
      const braveExists = await db.getAsync("SELECT 1 FROM api_providers WHERE name = ?", ['Brave Search']);

      if (!braveExists) {
        await db.runAsync(
          `INSERT INTO api_providers (name, description, is_active, requires_api_key, supports_extra_config, is_external, is_manual, website, api_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'Brave Search', // name
            'Brave Search API for web results (used by Deep Search SDK).', // description
            1, // is_active
            1, // requires_api_key
            0, // supports_extra_config (no extra config needed, just the key)
            1, // is_external
            0, // is_manual
            'https://brave.com/search/api/', // website
            'https://brave.com/search/api/' // api_url (placeholder, as not directly called by backend, used by SDK)
          ]
        );
        console.log('Brave Search provider added successfully.');
      } else {
        // Optionally update existing entry if needed (e.g., ensure flags are correct)
        await db.runAsync(
          "UPDATE api_providers SET description = ?, requires_api_key = 1, supports_extra_config = 0, is_external = 1, is_manual = 0 WHERE name = ?",
          ['Brave Search API for web results (used by Deep Search SDK).', 'Brave Search']
        );
        console.log('Brave Search provider already exists, ensured configuration is up-to-date.');
      }
      return true; // Indicate success
    } catch (error) {
      console.error('Error applying migration 009_add_brave_search_provider:', error);
      throw error; // Re-throw error to halt migration process
    }
  },

  // Remove db parameter from signature
  down: async () => {
    console.warn('\nReverting migration 009_add_brave_search_provider: Removing Brave Search provider...');
    try {
      await db.runAsync("DELETE FROM api_providers WHERE name = ?", ['Brave Search']);
      console.log('Brave Search provider removed.');
    } catch (error) {
      console.error('Error rolling back migration 009_add_brave_search_provider:', error);
      // Don't throw error on rollback failure, just log it
    }
  }
};
