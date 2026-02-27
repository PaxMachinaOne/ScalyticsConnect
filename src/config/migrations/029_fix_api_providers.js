// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * API Providers fix module
 *
 * This migration ensures the api_providers table has the correct structure
 * and default provider entries.
 */
const { db } = require('../../models/db'); // Import the shared db instance

/**
 * Fixes API providers INSERT statements issue
 */
async function fixApiProviders() {
  try {
    const tableExists = await db.getAsync(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='api_providers'
    `);

    if (!tableExists) {
      console.warn('[Migration: 029_fix_api_providers] api_providers table does not exist. Skipping column checks.');
    } else {
      const columns = await db.allAsync(`PRAGMA table_info(api_providers)`);
      const websiteColumnExists = columns.some(col => col.name === 'website');
 
       if (!websiteColumnExists) {
          try {
             await db.runAsync(`ALTER TABLE api_providers ADD COLUMN website TEXT`);
          } catch (addColumnError) {
              if (addColumnError.message && addColumnError.message.includes('duplicate column name')) {
              } else {
                  console.error('  Failed to add website column:', addColumnError);
                 throw addColumnError;
              }
          }
       }
 

       const isExternalColumnExists = columns.some(col => col.name === 'is_external');
       if (!isExternalColumnExists) {
          try {
             await db.runAsync(`ALTER TABLE api_providers ADD COLUMN is_external BOOLEAN DEFAULT 1`);
          } catch (addColumnError) {
              if (addColumnError.message && addColumnError.message.includes('duplicate column name')) {
              } else {
                  console.error('  Failed to add is_external column:', addColumnError);
                 throw addColumnError;
              }
          }
       }
 
       const isManualColumnExists = columns.some(col => col.name === 'is_manual');
       if (!isManualColumnExists) {
         try {
             await db.runAsync(`ALTER TABLE api_providers ADD COLUMN is_manual BOOLEAN DEFAULT 0`);
         } catch (addColumnError) {
             if (addColumnError.message && addColumnError.message.includes('duplicate column name')) {
             } else {
                 console.error('  Failed to add is_manual column:', addColumnError);
                throw addColumnError; 
             }
         }
       }
     }

    const providers = [
      {
        name: 'OpenAI',
        description: 'OpenAI API for ChatGPT, GPT-4, and other models',
        api_url: 'https://api.openai.com',
        website: 'https://openai.com'
      },
      {
        name: 'Anthropic',
        description: 'Anthropic API for Claude models',
        api_url: 'https://api.anthropic.com',
        website: 'https://anthropic.com'
      },
      {
        name: 'Cohere',
        description: 'Cohere API for Command models',
        api_url: 'https://api.cohere.ai',
        website: 'https://cohere.ai'
      },
      {
        name: 'Mistral',
        description: 'Mistral API for Mistral models',
        api_url: 'https://api.mistral.ai',
        website: 'https://mistral.ai'
      },
      { // Added Google provider details
        name: 'Google',
        description: 'Google Gemini API',
        api_url: 'https://generativelanguage.googleapis.com',
        website: 'https://ai.google.dev/'
      }
    ];

    for (const provider of providers) {
      try {
        const existingProvider = await db.getAsync(
          'SELECT id FROM api_providers WHERE name = ?',
          [provider.name]
        );

        if (!existingProvider) {
          await db.runAsync(
            `INSERT INTO api_providers (name, description, api_url, website, is_external, is_manual)
             VALUES (?, ?, ?, ?, 1, 0)`, 
            [provider.name, provider.description, provider.api_url, provider.website]
          );
        } else {
          await db.runAsync(
            `UPDATE api_providers
             SET website = COALESCE(website, ?), is_external = 1, is_manual = 0
             WHERE id = ?`,
            [provider.website, existingProvider.id]
          );
        }
      } catch (err) {
        console.error(`[Migration: 029_fix_api_providers] Error processing provider ${provider.name}:`, err);
      }
    }

    try {
        await db.runAsync(`UPDATE api_providers SET is_external = 0, is_manual = 0 WHERE name LIKE 'Scalytics %'`);
    } catch(internalErr) {
        console.error('[Migration: 029_fix_api_providers] Error marking Scalytics providers as internal/not-manual:', internalErr);
    }

    try {
      await db.runAsync(`DELETE FROM api_providers WHERE name = ?`, ['Local']);
    } catch (deleteErr) {
       console.error('[Migration: 029_fix_api_providers] Error deleting "Local" provider:', deleteErr);
    }

  } catch (err) {
    console.error('[Migration: 029_fix_api_providers] Error fixing api_providers:', err);
    throw err; 
  }
}

module.exports = { runMigration: fixApiProviders };
