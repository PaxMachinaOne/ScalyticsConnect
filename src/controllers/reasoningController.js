// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * Reasoning Controller
 * 
 * Handles API endpoints for agent reasoning step persistence and retrieval
 */
const reasoningLoggerService = require('../services/reasoningLoggerService');
const { APIError } = require('../utils/errorUtils');

/**
 * Creates a new reasoning step
 */
const createReasoningStep = async (req, res, next) => {
  try {
    const { chatId, taskId, stepMessage, explanationMessage, parentStepId, metadata } = req.body;

    if (!chatId || !taskId || !stepMessage || !explanationMessage) {
      return next(new APIError('Missing required fields: chatId, taskId, stepMessage, explanationMessage', 400));
    }

    const stepId = await reasoningLoggerService.createStep(
      chatId,
      taskId,
      stepMessage,
      explanationMessage,
      parentStepId || null,
      metadata || null
    );

    res.json({
      success: true,
      stepId: stepId,
      message: 'Reasoning step created successfully'
    });
  } catch (error) {
    console.error('[ReasoningController] Error creating reasoning step:', error);
    return next(new APIError('Failed to create reasoning step', 500));
  }
};

/**
 * Retrieves reasoning steps for a chat
 */
const getReasoningStepsForChat = async (req, res, next) => {
  try {
    const { chatId } = req.params;

    if (!chatId || isNaN(parseInt(chatId))) {
      return next(new APIError('Invalid chat ID', 400));
    }

    const steps = await reasoningLoggerService.getStepsForChat(parseInt(chatId));

    res.json({
      success: true,
      steps: steps,
      count: steps.length
    });
  } catch (error) {
    console.error('[ReasoningController] Error retrieving reasoning steps:', error);
    return next(new APIError('Failed to retrieve reasoning steps', 500));
  }
};

/**
 * Updates the status of a reasoning step
 */
const updateReasoningStepStatus = async (req, res, next) => {
  try {
    const { stepId } = req.params;
    const { status, errorMessage } = req.body;

    if (!stepId || isNaN(parseInt(stepId))) {
      return next(new APIError('Invalid step ID', 400));
    }

    if (!status || !['running', 'completed', 'failed'].includes(status)) {
      return next(new APIError('Invalid status. Must be: running, completed, or failed', 400));
    }

    await reasoningLoggerService.updateStepStatus(
      parseInt(stepId),
      status,
      errorMessage || null
    );

    res.json({
      success: true,
      message: 'Reasoning step status updated successfully'
    });
  } catch (error) {
    console.error('[ReasoningController] Error updating reasoning step status:', error);
    return next(new APIError('Failed to update reasoning step status', 500));
  }
};

const getReasoningStepsForTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return next(new APIError('Invalid task ID', 400));
    }

    const steps = await reasoningLoggerService.getStepsForTask(taskId);

    res.json({
      success: true,
      steps: steps,
      count: steps.length
    });
  } catch (error) {
    console.error('[ReasoningController] Error retrieving reasoning steps for task:', error);
    return next(new APIError('Failed to retrieve reasoning steps for task', 500));
  }
};

module.exports = {
  createReasoningStep,
  getReasoningStepsForChat,
  getReasoningStepsForTask,
  updateReasoningStepStatus
};
