// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Reasoning Logger Service
 * 
 * Handles CRUD operations for agent reasoning steps, providing persistence
 * for the explainable AI reasoning trail during Deep Search operations.
 */
const { db } = require('../models/db');

class ReasoningLoggerService {
    /**
     * Creates a new reasoning step in the database
     * @param {number} chatId - The chat session ID
     * @param {string} taskId - The Deep Search task ID
     * @param {string} stepMessage - Short technical message (e.g., "search PROVIDER for")
     * @param {string} explanationMessage - User-friendly explanation (e.g., "Searching for PHRASES")
     * @param {number|null} parentStepId - ID of parent step for hierarchical structure
     * @param {Object} metadata - Optional metadata object
     * @returns {Promise<number>} The ID of the created step
     */
    async createStep(chatId, taskId, stepMessage, explanationMessage, parentStepId = null, metadata = null) {
        try {
            // Get the next step order for this chat
            const orderResult = await db.getAsync(
                'SELECT COALESCE(MAX(step_order), -1) + 1 as next_order FROM agent_reasoning_steps WHERE chat_id = ?',
                [chatId]
            );
            const stepOrder = orderResult?.next_order || 0;

            const metadataJson = metadata ? JSON.stringify(metadata) : null;

            const result = await db.runAsync(
                `INSERT INTO agent_reasoning_steps 
                 (chat_id, task_id, parent_step_id, step_order, step_message, explanation_message, status, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
                [chatId, taskId, parentStepId, stepOrder, stepMessage, explanationMessage, metadataJson]
            );

            return result.lastID;
        } catch (error) {
            console.error('[ReasoningLoggerService] Error creating reasoning step:', error);
            throw error;
        }
    }

    /**
     * Updates the status of an existing reasoning step
     * @param {number} stepId - The step ID to update
     * @param {string} status - New status ('running', 'completed', 'failed')
     * @param {string|null} errorMessage - Error message if status is 'failed'
     * @returns {Promise<void>}
     */
    async updateStepStatus(stepId, status, errorMessage = null) {
        try {
            const completedAt = status === 'completed' ? new Date().toISOString() : null;
            
            await db.runAsync(
                `UPDATE agent_reasoning_steps 
                 SET status = ?, completed_at = ?, error_message = ?
                 WHERE id = ?`,
                [status, completedAt, errorMessage, stepId]
            );
        } catch (error) {
            console.error('[ReasoningLoggerService] Error updating step status:', error);
            throw error;
        }
    }

    /**
     * Updates the explanation message of an existing reasoning step
     * @param {number} stepId - The step ID to update
     * @param {string} explanationMessage - New explanation message
     * @returns {Promise<void>}
     */
    async updateStepExplanation(stepId, explanationMessage) {
        try {
            await db.runAsync(
                'UPDATE agent_reasoning_steps SET explanation_message = ? WHERE id = ?',
                [explanationMessage, stepId]
            );
        } catch (error) {
            console.error('[ReasoningLoggerService] Error updating step explanation:', error);
            throw error;
        }
    }

    /**
     * Retrieves all reasoning steps for a specific chat, ordered hierarchically
     * @param {number} chatId - The chat session ID
     * @returns {Promise<Array>} Array of reasoning steps with nested structure
     */
    async getStepsForChat(chatId) {
        try {
            const steps = await db.allAsync(
                `SELECT id, chat_id, task_id, parent_step_id, step_order, step_message, 
                        explanation_message, status, created_at, completed_at, error_message, metadata
                 FROM agent_reasoning_steps 
                 WHERE chat_id = ? 
                 ORDER BY step_order ASC, created_at ASC`,
                [chatId]
            );

            // Parse metadata JSON for each step
            return steps.map(step => ({
                ...step,
                metadata: step.metadata ? JSON.parse(step.metadata) : null
            }));
        } catch (error) {
            console.error('[ReasoningLoggerService] Error retrieving steps for chat:', error);
            throw error;
        }
    }

    /**
     * Retrieves reasoning steps for a specific task
     * @param {string} taskId - The Deep Search task ID
     * @returns {Promise<Array>} Array of reasoning steps for the task
     */
    async getStepsForTask(taskId) {
        try {
            const steps = await db.allAsync(
                `SELECT id, chat_id, task_id, parent_step_id, step_order, step_message, 
                        explanation_message, status, created_at, completed_at, error_message, metadata
                 FROM agent_reasoning_steps 
                 WHERE task_id = ? 
                 ORDER BY step_order ASC, created_at ASC`,
                [taskId]
            );

            return steps.map(step => ({
                ...step,
                metadata: step.metadata ? JSON.parse(step.metadata) : null
            }));
        } catch (error) {
            console.error('[ReasoningLoggerService] Error retrieving steps for task:', error);
            throw error;
        }
    }

    /**
     * Deletes all reasoning steps for a specific chat (for cleanup)
     * @param {number} chatId - The chat session ID
     * @returns {Promise<void>}
     */
    async deleteStepsForChat(chatId) {
        try {
            await db.runAsync(
                'DELETE FROM agent_reasoning_steps WHERE chat_id = ?',
                [chatId]
            );
        } catch (error) {
            console.error('[ReasoningLoggerService] Error deleting steps for chat:', error);
            throw error;
        }
    }

    /**
     * Builds a hierarchical structure from flat reasoning steps
     * @param {Array} flatSteps - Flat array of reasoning steps
     * @returns {Array} Hierarchically structured reasoning steps
     */
    buildHierarchy(flatSteps) {
        const stepMap = new Map();
        const rootSteps = [];

        // Create a map of all steps
        flatSteps.forEach(step => {
            stepMap.set(step.id, { ...step, children: [] });
        });

        // Build the hierarchy
        flatSteps.forEach(step => {
            if (step.parent_step_id) {
                const parent = stepMap.get(step.parent_step_id);
                if (parent) {
                    parent.children.push(stepMap.get(step.id));
                } else {
                    // Parent not found, treat as root
                    rootSteps.push(stepMap.get(step.id));
                }
            } else {
                rootSteps.push(stepMap.get(step.id));
            }
        });

        return rootSteps;
    }
}

module.exports = new ReasoningLoggerService();
