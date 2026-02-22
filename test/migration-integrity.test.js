// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('../src/models/db', () => ({
  db: {
    getAsync: jest.fn(),
    allAsync: jest.fn(),
    runAsync: jest.fn(),
    execAsync: jest.fn(),
  },
  initializeDatabase: jest.fn().mockResolvedValue(true),
}));

describe('Migration Integrity', () => {
  const MIGRATIONS_DIR = path.join(__dirname, '../src/config/migrations');

  test('all migration files should export a valid entry point (up or runMigration)', () => {
    const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.js') && /^\d{3}[A-Z]?_/.test(file));

    expect(migrationFiles.length).toBeGreaterThan(0);

    migrationFiles.forEach(file => {
      const migrationPath = path.join(MIGRATIONS_DIR, file);
      const migration = require(migrationPath);
      
      const hasUp = typeof migration.up === 'function';
      const hasRunMigration = typeof migration.runMigration === 'function';
      
      if (!hasUp && !hasRunMigration) {
        throw new Error(`Migration ${file} does not export 'up' or 'runMigration' function.`);
      }
    });
  });
});
