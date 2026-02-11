// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration: 040_add_multi_model_fields
 * 
 * Adds the necessary columns to the `models` table to support a multi-model,
 * multi-GPU architecture.
 * 
 * - `model_type`: To distinguish between different types of models (e.g., 'llm', 'tts').
 * - `assigned_gpu_id`: To track which GPU a model is assigned to.
 */
const { db } = require('../../models/db');

// Helper function to check if a column exists
const columnExists = async (tableName, columnName) => {
    const result = await db.allAsync(`PRAGMA table_info(${tableName})`);
    return result.some(column => column.name === columnName);
};

async function up() {
    console.log('Running migration: 040_add_multi_model_fields (up)');
    try {
        // Use a transaction to ensure atomicity
        await db.runAsync('BEGIN TRANSACTION;');

        // Add model_type column if it doesn't exist
        if (!await columnExists('models', 'model_type')) {
            await db.runAsync(`
                ALTER TABLE models ADD COLUMN model_type TEXT DEFAULT 'llm'
            `);
            console.log('  - Added column: model_type');
        } else {
            console.log('  - Column model_type already exists, skipping.');
        }

        // Add assigned_gpu_id column if it doesn't exist
        if (!await columnExists('models', 'assigned_gpu_id')) {
            await db.runAsync(`
                ALTER TABLE models ADD COLUMN assigned_gpu_id INTEGER DEFAULT 0
            `);
            console.log('  - Added column: assigned_gpu_id');
        } else {
            console.log('  - Column assigned_gpu_id already exists, skipping.');
        }

        await db.runAsync('COMMIT;');
        console.log('Migration 040 completed successfully.');
    } catch (err) {
        await db.runAsync('ROLLBACK;');
        console.error('Migration 040 failed:', err);
        throw err;
    }
}

async function down() {
    console.log('Running migration: 040_add_multi_model_fields (down)');
    try {
        // Use a transaction
        await db.runAsync('BEGIN TRANSACTION;');

        // This is a simplified down migration. In a real-world scenario,
        // you might need to handle data from the dropped columns.
        // For SQLite, dropping columns is complex, so we often recreate the table.
        // Here, we'll assume it's safe to just leave the columns for this project.
        // A full implementation would be:
        // 1. CREATE a new table without the columns
        // 2. COPY data from the old table to the new one
        // 3. DROP the old table
        // 4. RENAME the new table
        console.log('  - Down migration for SQLite is complex and often skipped for simple column additions.');
        console.log('  - The columns model_type and assigned_gpu_id will be left in place.');

        await db.runAsync('COMMIT;');
        console.log('Migration 040 (down) completed.');
    } catch (err) {
        await db.runAsync('ROLLBACK;');
        console.error('Migration 040 (down) failed:', err);
        throw err;
    }
}

module.exports = { up, down };
