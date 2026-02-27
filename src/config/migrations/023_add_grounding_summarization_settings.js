// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db'); 

/**
 * Adds user settings for summarization, transparency, and message feedback table.
 */
module.exports = {
  up: async () => { 
    const migrationName = '023_add_grounding_summarization_settings'; 
    try {
      console.log('Checking and adding columns to users table...');
      
      const tableInfo = await db.allAsync('PRAGMA table_info(users)');
      const existingColumns = tableInfo.map(col => col.name);
      
      const addColumnIfNotExists = async (columnName, definition) => {
        if (!existingColumns.includes(columnName)) {
          await db.runAsync(`ALTER TABLE users ADD COLUMN ${columnName} ${definition}`);
          console.log(`Added column: ${columnName}`);
        } else {
          console.log(`Column already exists, skipping: ${columnName}`);
        }
      };
      
      await addColumnIfNotExists('summarization_enabled', 'BOOLEAN DEFAULT 0');
      await addColumnIfNotExists('summarization_model_id', 'INTEGER REFERENCES models(id) ON DELETE SET NULL');
      await addColumnIfNotExists('summarization_temperature_preset', "TEXT CHECK( summarization_temperature_preset IN ('strict', 'balanced', 'detailed') ) DEFAULT 'strict'");
      await addColumnIfNotExists('display_summarization_notice', 'BOOLEAN DEFAULT 1');
      await addColumnIfNotExists('custom_system_prompt', 'TEXT');
      
      console.log('User table columns check completed.');

      console.log('Creating message_feedback table...');
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS message_feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          rating INTEGER NOT NULL CHECK(rating IN (-1, 1)), -- -1 for downvote, 1 for upvote
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          UNIQUE(message_id, user_id) -- Allow only one rating per user per message
        )
      `);
      console.log('message_feedback table created.');

    } catch (error) {
      console.error(`Error applying migration ${migrationName}:`, error);
      throw error; 
    }
  },

  down: async () => { 
    try {
      await db.runAsync(`DROP TABLE IF EXISTS message_feedback`);
      console.log('Dropped table: message_feedback');

      await db.runAsync(`ALTER TABLE users DROP COLUMN custom_system_prompt`);
      await db.runAsync(`ALTER TABLE users DROP COLUMN display_summarization_notice`);
      await db.runAsync(`ALTER TABLE users DROP COLUMN summarization_temperature_preset`);
      await db.runAsync(`ALTER TABLE users DROP COLUMN summarization_model_id`);
      await db.runAsync(`ALTER TABLE users DROP COLUMN summarization_enabled`);
      console.log('Dropped columns from users table.');

    } catch (error) {
      console.warn('Warning: Could not automatically drop columns. This might require manual table recreation in older SQLite versions.', error);
    }
  }
};
