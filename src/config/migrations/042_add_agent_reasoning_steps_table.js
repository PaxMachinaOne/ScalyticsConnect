// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Migration: 042_add_agent_reasoning_steps_table
 * 
 * Purpose:
 * - Creates a new `agent_reasoning_steps` table to store the step-by-step reasoning trail
 *   for Deep Search operations, providing full traceability and explainability.
 * - Enables persistent audit trail of agent decision-making process that can be displayed
 *   in real-time during execution and reviewed after completion.
 * - Links reasoning steps to chat sessions for proper context and user access control.
 */
const { db } = require('../../models/db'); 

async function up() {
    console.log('Running migration: 042_add_agent_reasoning_steps_table (up)');
    try {
        await db.runAsync('BEGIN TRANSACTION;');

        // Create the agent reasoning steps table
        await db.runAsync(`
            CREATE TABLE IF NOT EXISTS agent_reasoning_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                task_id TEXT NOT NULL,
                parent_step_id INTEGER,
                step_order INTEGER NOT NULL DEFAULT 0,
                step_message TEXT NOT NULL,
                explanation_message TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')) DEFAULT 'running',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                error_message TEXT NULL,
                metadata TEXT NULL,
                FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE,
                FOREIGN KEY (parent_step_id) REFERENCES agent_reasoning_steps (id) ON DELETE CASCADE
            )
        `);
        console.log('  - Created table: agent_reasoning_steps');

        // Create indexes for performance
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_agent_reasoning_steps_chat_id ON agent_reasoning_steps(chat_id);`);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_agent_reasoning_steps_task_id ON agent_reasoning_steps(task_id);`);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_agent_reasoning_steps_parent ON agent_reasoning_steps(parent_step_id);`);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_agent_reasoning_steps_status ON agent_reasoning_steps(status);`);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_agent_reasoning_steps_order ON agent_reasoning_steps(chat_id, step_order);`);
        console.log('  - Created performance indexes for agent_reasoning_steps');

        await db.runAsync('COMMIT;');
        console.log('Migration 042 completed successfully.');
    } catch (err) {
        await db.runAsync('ROLLBACK;');
        console.error('Migration 042 failed:', err);
        throw err;
    }
}

async function down() {
    console.log('Running migration: 042_add_agent_reasoning_steps_table (down)');
    console.log('  - Down migration is not implemented for this schema addition.');
    console.log('  - The agent_reasoning_steps table and its indexes will not be removed.');
}

module.exports = { up, down };
