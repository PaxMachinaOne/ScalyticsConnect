// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); // Import db instance

/**
 * Migration: 035_add_courtlistener_provider
 *
 * Adds the CourtListener provider to the api_providers table.
 */
module.exports = {
  up: async () => {
    console.log('\nRunning migration 035_add_courtlistener_provider: Adding CourtListener provider...');
    try {
      const courtListenerExists = await db.getAsync("SELECT 1 FROM api_providers WHERE name = ?", ['CourtListener']);

      if (!courtListenerExists) {
        await db.runAsync(
          `INSERT INTO api_providers (name, description, is_active, requires_api_key, is_external, is_manual, website, api_url, endpoints, is_search_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            'CourtListener', // name
            'CourtListener API for legal document search. See https://www.courtlistener.com/help/api/rest/ for documentation and to get an API key.', // description
            1, // is_active
            1, // requires_api_key
            1, // is_external
            0, // is_manual
            'https://www.courtlistener.com/', // website
            'https://www.courtlistener.com/api/rest/v4/', // api_url
            JSON.stringify({ search: 'opinions/' }), // endpoints
            1 // is_search_provider
          ]
        );
        console.log('CourtListener provider added successfully.');
      } else {
        await db.runAsync(
          "UPDATE api_providers SET description = ?, requires_api_key = 1, is_external = 1, is_manual = 0, is_search_provider = 1, api_url = ?, endpoints = ? WHERE name = ?",
          [
            'CourtListener API for legal document search. See https://www.courtlistener.com/help/api/rest/ for documentation and to get an API key.',
            'https://www.courtlistener.com/api/rest/v4/',
            JSON.stringify({ search: 'opinions/' }),
            'CourtListener'
          ]
        );
        console.log('CourtListener provider already exists, ensured configuration is up-to-date.');
      }
      return true;
    } catch (error) {
      console.error('Error applying migration 035_add_courtlistener_provider:', error);
      throw error;
    }
  },

  down: async () => {
    console.warn('\nReverting migration 035_add_courtlistener_provider: Removing CourtListener provider...');
    try {
      await db.runAsync("DELETE FROM api_providers WHERE name = ?", ['CourtListener']);
      console.log('CourtListener provider removed.');
    } catch (error) {
      console.error('Error rolling back migration 035_add_courtlistener_provider:', error);
    }
  }
};
