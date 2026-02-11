// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration: 041_add_bot_trap_detection_fields
 * 
 * Purpose:
 * - Enhances the `domain_trust_profiles` table with columns to track and manage timeouts,
 *   bot traps, and temporary blacklisting of domains that are unresponsive or malicious.
 * - Creates a new `url_failure_log` table to record specific URL failures for later analysis.
 * - Adds necessary indexes for performance.
 * 
 * This is a critical performance and stability improvement for the Deep Search agent.
 */
const { db } = require('../../models/db'); 

// Helper function to check if a column exists in a table
const columnExists = async (tableName, columnName) => {
    try {
        const result = await db.allAsync(`PRAGMA table_info(${tableName})`);
        return result.some(column => column.name === columnName);
    } catch (err) {
        console.error(`Error checking column ${columnName} in ${tableName}:`, err);
        return false; 
    }
};

async function up() {
    console.log('Running migration: 041_add_bot_trap_detection_fields (up)');
    try {
        await db.runAsync('BEGIN TRANSACTION;');

        const columnsToAdd = [
            { name: 'is_bot_trap', type: 'BOOLEAN DEFAULT 0' },
            { name: 'consecutive_timeouts', type: 'INTEGER DEFAULT 0' },
            { name: 'last_timeout_at', type: 'TIMESTAMP NULL' },
            { name: 'blacklist_until', type: 'TIMESTAMP NULL' },
            { name: 'is_temporary_blacklist', type: 'BOOLEAN DEFAULT 0' },
            { name: 'avg_response_time_ms', type: 'INTEGER DEFAULT NULL' },
            { name: 'blacklist_reason', type: 'TEXT DEFAULT NULL' },
            { name: 'auto_blacklisted_at', type: 'TIMESTAMP NULL' }
        ];

        for (const col of columnsToAdd) {
            if (!await columnExists('domain_trust_profiles', col.name)) {
                await db.runAsync(`ALTER TABLE domain_trust_profiles ADD COLUMN ${col.name} ${col.type}`);
                console.log(`  - Added column: ${col.name} to domain_trust_profiles`);
            } else {
                console.log(`  - Column ${col.name} already exists in domain_trust_profiles, skipping.`);
            }
        }

        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS url_failure_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                domain TEXT NOT NULL,
                failure_type TEXT NOT NULL,
                response_time_ms INTEGER,
                error_details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('  - Ensured table url_failure_log exists.');

        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_domain_trust_bot_trap ON domain_trust_profiles(domain, is_bot_trap);`);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_domain_blacklist_check ON domain_trust_profiles(domain, blacklist_until, is_bot_trap);`);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_url_failure_domain ON url_failure_log(domain, failure_type);`);
        console.log('  - Ensured performance indexes exist.');

        await db.runAsync('COMMIT;');
        console.log('Migration 041 completed successfully.');
    } catch (err) {
        await db.runAsync('ROLLBACK;');
        console.error('Migration 041 failed:', err);
        throw err;
    }
}

async function down() {
    console.log('Running migration: 041_add_bot_trap_detection_fields (down)');
    console.log('  - Down migration is not implemented for this schema addition.');
    console.log('  - The new columns in domain_trust_profiles and the url_failure_log table will not be removed.');
}

module.exports = { up, down };
