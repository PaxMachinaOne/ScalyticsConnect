// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration to ensure the Google API provider exists.
 */
const { db } = require('../../models/db'); 

async function runMigration() {
  const migrationName = '018_add_google_gemini';
  console.log(`Applying migration: ${migrationName}...`);

  try {
    const result = await db.runAsync(`
      INSERT OR IGNORE INTO api_providers (name, description, api_url, website, is_active) 
      VALUES (?, ?, ?, ?, ?)
    `, [
      'Google', 
      'Google Gemini API', 
      'https://generativelanguage.googleapis.com', 
      'https://ai.google.dev/',
      1 // Ensure it's active by default
    ]);

    if (result.changes > 0) {
      console.log(`  Migration ${migrationName}: Added Google provider.`);
    } else {
      console.log(`  Migration ${migrationName}: Google provider already exists or IGNORE prevented insertion.`);
    }
    
    console.log(`Migration ${migrationName} applied successfully.`);
    return true;
  } catch (error) {
    console.error(`Error applying migration ${migrationName}:`, error);
    throw error; 
  }
}

module.exports = { runMigration };
