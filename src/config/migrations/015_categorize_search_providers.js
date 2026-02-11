// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db');

const MIGRATION_NAME = '015_categorize_search_providers';

module.exports = {
  async up() {
    console.log(`\nRunning migration ${MIGRATION_NAME}: Setting category for search providers...`);
    try {
      await db.runAsync('BEGIN TRANSACTION;');

      const searchProviders = ['Google Search', 'Bing Search', 'Brave Search'];
      let updatedCount = 0;

      for (const providerName of searchProviders) {
        const provider = await db.getAsync("SELECT id, category FROM api_providers WHERE name = ?", [providerName]);
        if (provider && provider.category !== 'Search') {
          const result = await db.runAsync(
            "UPDATE api_providers SET category = ?, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE name = ?",
            ['Search', providerName]
          );
          if (result.changes > 0) {
            console.log(`- Set category to 'Search' for provider: ${providerName}`);
            updatedCount++;
          }
        } else if (provider && provider.category === 'Search') {
          console.log(`- Provider ${providerName} already categorized as 'Search'.`);
        } else {
          console.warn(`- Provider ${providerName} not found. Skipping categorization.`);
        }
      }

      await db.runAsync('COMMIT;');
      console.log(`Migration ${MIGRATION_NAME} (up) completed. ${updatedCount} provider(s) updated.`);
    } catch (err) {
      await db.runAsync('ROLLBACK;');
      console.error(`Error applying migration ${MIGRATION_NAME} (up):`, err);
      throw err;
    }
  },

  async down() {
    console.log(`\nReverting migration ${MIGRATION_NAME}: Removing 'Search' category from specified providers (setting to NULL)...`);
    try {
      await db.runAsync('BEGIN TRANSACTION;');
      const searchProviders = ['Google Search', 'Bing Search', 'Brave Search'];
      let revertedCount = 0;

      for (const providerName of searchProviders) {
         const provider = await db.getAsync("SELECT id FROM api_providers WHERE name = ? AND category = 'Search'", [providerName]);
         if (provider) {
            const result = await db.runAsync(
              "UPDATE api_providers SET category = NULL, updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE name = ?",
              [providerName]
            );
            if (result.changes > 0) {
                console.log(`- Reverted category for provider: ${providerName} to NULL.`);
                revertedCount++;
            }
         } else {
            console.log(`- Provider ${providerName} not found or not categorized as 'Search'. No revert needed.`);
         }
      }
      await db.runAsync('COMMIT;');
      console.log(`Migration ${MIGRATION_NAME} (down) completed. ${revertedCount} provider(s) reverted.`);
    } catch (err) {
      await db.runAsync('ROLLBACK;');
      console.error(`Error reverting migration ${MIGRATION_NAME} (down):`, err);
      throw err;
    }
  }
};
