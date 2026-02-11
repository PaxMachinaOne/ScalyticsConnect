// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db'); 

async function runMigration() {
  console.log('[Migration: 022_add_avatar] Starting avatar migration...');

  try {
    const avatarsTableExists = await db.getAsync(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='avatars';
    `);

    if (avatarsTableExists) {
      console.log('[Migration: 022_add_avatar] Found existing "avatars" table. Dropping it...');
      await db.runAsync('DROP TABLE avatars;');
      console.log('[Migration: 022_add_avatar] "avatars" table dropped successfully.');
    } else {
      console.log('[Migration: 022_add_avatar] "avatars" table does not exist, skipping drop.');
    }

    const usersTableInfo = await db.allAsync('PRAGMA table_info(users);');
    const avatarColumnExists = usersTableInfo.some(col => col.name === 'avatar');

    if (!avatarColumnExists) {
      console.log('[Migration: 022_add_avatar] "avatar" column not found in "users" table. Adding it...');
      await db.runAsync('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT NULL;');
      console.log('[Migration: 022_add_avatar] "avatar" column added successfully to "users" table.');
    } else {
      console.log('[Migration: 022_add_avatar] "avatar" column already exists in "users" table.');
    }

    console.log('[Migration: 022_add_avatar] Avatar migration completed successfully.');

  } catch (error) {
    console.error('[Migration: 022_add_avatar] Error during avatar migration:', error);
    throw new Error(`Avatar migration failed: ${error.message}`);
  }
}

module.exports = { runMigration };

if (require.main === module) {
  console.log('Running add-avatar migration directly...');
  require('../../models/db').initializeDatabase()
    .then(runMigration)
    .then(() => {
      console.log('Direct execution of add-avatar migration finished.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Direct execution of add-avatar migration failed:', error);
      process.exit(1);
    });
}
