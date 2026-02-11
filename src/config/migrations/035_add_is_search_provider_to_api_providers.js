// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db');

/**
 * Migration: 036_add_is_search_provider_to_api_providers
 *
 * Adds the is_search_provider column to the api_providers table.
 */
module.exports = {
  up: async () => {
    console.log('\nRunning migration 036_add_is_search_provider_to_api_providers: Adding is_search_provider column...');
    try {
      const columns = await db.allAsync("PRAGMA table_info(api_providers)");
      const columnExists = columns.some(c => c.name === 'is_search_provider');

      if (!columnExists) {
        await db.runAsync('ALTER TABLE api_providers ADD COLUMN is_search_provider BOOLEAN DEFAULT 0');
        console.log('is_search_provider column added successfully.');
      } else {
        console.log('is_search_provider column already exists.');
      }
      return true;
    } catch (error) {
      console.error('Error applying migration 036_add_is_search_provider_to_api_providers:', error);
      throw error;
    }
  },

  down: async () => {
    console.warn('\nReverting migration 036_add_is_search_provider_to_api_providers: This migration does not support automatic rollback of column removal.');
  }
};
