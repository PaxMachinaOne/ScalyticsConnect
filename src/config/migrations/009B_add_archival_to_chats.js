// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
'use strict';

const { db } = require('../../models/db');

const MIGRATION_NAME = '009B_add_archival_to_chats';

async function columnExists(tableName, columnName) {
  const tableInfo = await db.allAsync(`PRAGMA table_info(${tableName})`);
  return tableInfo.some(col => col.name === columnName);
}

module.exports = {
  async up() {
    console.log(`Applying migration: ${MIGRATION_NAME}`);
    await db.runAsync('BEGIN TRANSACTION');
    try {
      // Add is_archived column
      if (!(await columnExists('chats', 'is_archived'))) {
        await db.runAsync('ALTER TABLE chats ADD COLUMN is_archived BOOLEAN DEFAULT FALSE NOT NULL');
        console.log('  Added column: is_archived to chats table.');
      } else {
        console.log('  Column is_archived already exists in chats table.');
      }

      // Add archived_at column
      if (!(await columnExists('chats', 'archived_at'))) {
        await db.runAsync('ALTER TABLE chats ADD COLUMN archived_at TIMESTAMP NULLABLE');
        console.log('  Added column: archived_at to chats table.');
      } else {
        console.log('  Column archived_at already exists in chats table.');
      }

      await db.runAsync('COMMIT');
      console.log(`Migration ${MIGRATION_NAME} applied successfully.`);
    } catch (error) {
      await db.runAsync('ROLLBACK');
      console.error(`Error applying migration ${MIGRATION_NAME}:`, error);
      throw error;
    }
  },

  async down() {
    console.warn(`Reverting migration ${MIGRATION_NAME}: Dropping columns is_archived and archived_at from chats table is not automatically supported and may require manual intervention or table recreation.`);
  }
};
