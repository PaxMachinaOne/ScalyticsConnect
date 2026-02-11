// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db');

async function up() {
  try {
    await db.runAsync(`
      ALTER TABLE users ADD COLUMN huggingface_token TEXT DEFAULT NULL;
    `);
    console.log('Migration 039: Added huggingface_token to users table successfully.');
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('Migration 039: Column huggingface_token already exists, skipping.');
    } else {
      console.error('Error running migration 039:', error);
      throw error;
    }
  }
}

async function down() {
  // This is not recommended for production, but useful for development
  try {
    // SQLite doesn't support DROP COLUMN directly in a simple way.
    // The common workaround is to create a new table, copy data, and rename.
    // For this migration, we will assume that dropping the column is not critical
    // for rollback and we can leave it.
    console.log('Migration 039 down: SQLite does not easily support dropping columns. The huggingface_token column will be left in place.');
  } catch (error) {
    console.error('Error running migration 039 down:', error);
    throw error;
  }
}

module.exports = { up, down };
