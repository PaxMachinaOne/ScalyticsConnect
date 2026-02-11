// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration to change the chats.model_id foreign key constraint
 * from ON DELETE CASCADE to ON DELETE SET NULL to prevent chat deletion
 * when a model is deleted.
 */
const { db } = require('../../models/db'); 

async function up() {
  try {
    const adminModelViewExists = await db.getAsync(
      "SELECT name FROM sqlite_master WHERE type='view' AND name='admin_model_access_view'"
    );

    if (adminModelViewExists) {
      await db.runAsync('DROP VIEW IF EXISTS admin_model_access_view');

      const columnsInfo = await db.allAsync("PRAGMA table_info(models)");
      const hasExternalModelId = columnsInfo.some(col => col.name === 'external_model_id');

      if (hasExternalModelId) {
        await db.runAsync(`
          CREATE VIEW admin_model_access_view AS
          SELECT
            m.id AS model_id, m.name AS model_name, m.description, m.model_path, m.context_window,
            -- Removed m.default_system_prompt
            m.external_provider_id, m.external_model_id,
            m.created_at, m.updated_at, g.id AS group_id, grp.name AS group_name
          FROM models m
          CROSS JOIN groups grp
          JOIN user_groups g ON g.group_id = grp.id
          WHERE grp.name = 'Administrator' AND m.is_active = 1
        `);
      } else {
        await db.runAsync(`
          CREATE VIEW admin_model_access_view AS
          SELECT
            m.id AS model_id, m.name AS model_name, m.description, m.model_path, m.context_window,
            -- Removed m.default_system_prompt
            m.external_provider_id,
            m.created_at, m.updated_at, g.id AS group_id, grp.name AS group_name
          FROM models m
          CROSS JOIN groups grp
          JOIN user_groups g ON g.group_id = grp.id
          WHERE grp.name = 'Administrator' AND m.is_active = 1
        `);
      }
    } else {
    }


    const fkList = await db.allAsync('PRAGMA foreign_key_list(chats);');
    const modelFk = fkList.find(fk => fk.to === 'models' && fk.from === 'model_id');

    if (modelFk && modelFk.on_delete === 'SET NULL') {
      console.log('Migration 030_fix_chat_model_fk: ON DELETE SET NULL already in place. Skipping table recreation.'); 
      return;
    }

    if (modelFk && modelFk.on_delete !== 'CASCADE') {
       console.warn(`Migration 030_fix_chat_model_fk: Unexpected ON DELETE action "${modelFk.on_delete}". Proceeding with caution.`);
    }

    // SQLite doesn't support ALTER FOREIGN KEY directly. Need to recreate the table.
    await db.runAsync('PRAGMA foreign_keys=off;');
    await db.runAsync('BEGIN TRANSACTION;');
    await db.runAsync('DROP VIEW IF EXISTS admin_model_access_view;');
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS chats_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          model_id INTEGER, -- Allow NULL
          title TEXT DEFAULT 'New Chat',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_archived BOOLEAN DEFAULT FALSE NOT NULL, -- Added
          archived_at TIMESTAMP NULLABLE,             -- Added
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE SET NULL -- Correct constraint
      );
    `);
    await db.runAsync(`
      INSERT INTO chats_new (id, user_id, model_id, title, created_at, updated_at, is_archived, archived_at)
      SELECT id, user_id, model_id, title, created_at, updated_at, is_archived, archived_at
      FROM chats;
    `);
    await db.runAsync('DROP TABLE chats;');
    await db.runAsync('ALTER TABLE chats_new RENAME TO chats;');
    await db.runAsync(`
      CREATE VIEW admin_model_access_view AS
      SELECT
        m.id AS model_id,
        m.name AS model_name,
        m.description,
        m.model_path,
        m.context_window,
        -- Removed m.default_system_prompt
        m.external_provider_id,
        m.external_model_id,
        m.created_at,
        m.updated_at,
        g.id AS group_id,
        grp.name AS group_name
      FROM models m
      CROSS JOIN groups grp
      JOIN user_groups g ON g.group_id = grp.id
      WHERE grp.name = 'Administrator'
      AND m.is_active = 1
    `);
    await db.runAsync('COMMIT;');
    console.log('Migration 030_fix_chat_model_fk applied successfully.'); 

  } catch (error) {
    console.error('Error applying migration 030_fix_chat_model_fk:', error);
    try {
      await db.runAsync('ROLLBACK;');
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    throw error; 
  } finally {
    await db.runAsync('PRAGMA foreign_keys=on;');
  }
}

module.exports = { up };
