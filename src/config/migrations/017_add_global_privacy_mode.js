// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db');

/**
 * Migration to add global privacy mode setting to system_settings table
 * and add is_external flag to api_providers table
 */
async function runMigration() { // Renamed function to runMigration
  console.log('Running migration: 017_add_global_privacy_mode'); // Updated migration number
  
  try {
    console.log('Step 1: Adding global privacy mode setting');
    console.log('------------------------------------------');
    
    const existingSetting = await db.getAsync(
      'SELECT key FROM system_settings WHERE key = ?',
      ['global_privacy_mode']
    );
    
    if (!existingSetting) {
      await db.runAsync(
        `INSERT INTO system_settings (key, value, updated_at) 
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        ['global_privacy_mode', 'false']
      );
      
      console.log('Added global_privacy_mode setting to system_settings table');
    } else {
      console.log('global_privacy_mode setting already exists, skipping');
    }
    
    console.log('\nStep 2: Adding is_external flag to api_providers table');
    console.log('-----------------------------------------------------');
    
    const tableInfo = await db.allAsync('PRAGMA table_info(api_providers)');
    const hasIsExternalColumn = tableInfo.some(column => column.name === 'is_external');

    if (hasIsExternalColumn) {
      console.log('is_external column already exists in api_providers table, skipping creation');
    } else {
      await db.runAsync(`
        ALTER TABLE api_providers ADD COLUMN is_external INTEGER DEFAULT 0 NOT NULL
      `);
      console.log('Added is_external column to api_providers table');
    }

    console.log('Updating is_external flag for known external providers...');
    
    const updateResult = await db.runAsync(`
      UPDATE api_providers 
      SET is_external = 1 
      WHERE name LIKE '%OpenAI%' 
         OR name LIKE '%Anthropic%' 
         OR name LIKE '%Claude%'
         OR name LIKE '%GPT%'
         OR name LIKE '%Google AI%' 
         OR name LIKE '%Azure OpenAI%'
         OR name LIKE '%Cohere%'
         OR name LIKE '%Mistral%'
         OR name LIKE '%Hugging Face%'
         OR (name LIKE '%External%' AND name NOT LIKE '%Internal%')
    `);
    
    console.log(`Updated ${updateResult.changes} providers as external`);
    
    await db.runAsync(`
      UPDATE api_providers 
      SET is_external = 0 
      WHERE name LIKE '%Internal Auth%'
         OR name LIKE '%User Service%'
         OR name LIKE '%Core%'
    `);

    const providers = await db.allAsync(`
      SELECT id, name, is_external 
      FROM api_providers 
      ORDER BY is_external DESC, name ASC
    `);
    
    console.log('\nProvider external status:');
    console.log('------------------------');
    providers.forEach(provider => {
      const status = provider.is_external ? 'EXTERNAL' : 'INTERNAL';
      console.log(`${provider.id.toString().padEnd(3)} ${status.padEnd(10)} ${provider.name}`);
    });
    
    await db.runAsync(
      `INSERT INTO access_logs (user_id, action, details, ip_address) 
       VALUES (?, ?, ?, ?)`,
      [1, 'migration', 'Added global_privacy_mode and is_external flag', 'localhost']
    );
    
    console.log('\nMigration completed successfully');
    return true;
  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

module.exports = { runMigration }; // Updated to export runMigration

if (require.main === module) {
  runMigration() // Updated function call
    .then(success => {
      if (success) {
        console.log('Migration 017_add_global_privacy_mode (direct run) completed successfully'); // Updated log
        process.exit(0);
      } else {
        console.error('Migration 017_add_global_privacy_mode (direct run) failed'); // Updated log
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Error during direct run of 017_add_global_privacy_mode:', err); // Updated log
      process.exit(1);
    });
}
