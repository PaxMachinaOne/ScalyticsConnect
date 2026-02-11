// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration to add chat_shares table for read-only chat sharing with invitations.
 */
const { db } = require('../../models/db'); 

async function up() {
  console.log('Applying migration: 025_enable_chat_share_invitations...');

  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS chat_shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL, -- The user the chat is shared WITH
          permission_level TEXT NOT NULL DEFAULT 'read', -- Initially fixed to 'read'
          status TEXT NOT NULL DEFAULT 'pending', -- ('pending', 'accepted', 'declined')
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE (chat_id, user_id)
      );
    `);
    console.log('  Ensured chat_shares table exists.');

    const tableInfo = await db.allAsync('PRAGMA table_info(chat_shares)');
    const columns = tableInfo.map(col => col.name);

    if (!columns.includes('owner_user_id')) {
      console.log('  Adding owner_user_id column to chat_shares...');
      await db.runAsync('ALTER TABLE chat_shares ADD COLUMN owner_user_id INTEGER');
      console.log('  Added owner_user_id column.');
      console.warn('  Note: Existing shares might have NULL owner_user_id. Manual update might be needed if required.');
    } else {
      console.log('  Column owner_user_id already exists.');
    }

    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_chat_shares_chat_id ON chat_shares(chat_id);`);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_chat_shares_user_id ON chat_shares(user_id);`);
    await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_chat_shares_status ON chat_shares(status);`);
    console.log('  Ensured indexes exist.');

    await db.runAsync(`
      CREATE TRIGGER IF NOT EXISTS chat_shares_update_timestamp
      AFTER UPDATE ON chat_shares
      FOR EACH ROW
      BEGIN
          UPDATE chat_shares SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);
    console.log('  Ensured update trigger exists.');

    console.log('Migration 025_enable_chat_share_invitations applied successfully.');

  } catch (error) {
    console.error('Error applying migration 025_enable_chat_share_invitations:', error);
    throw error;
  }
}


module.exports = { up };
