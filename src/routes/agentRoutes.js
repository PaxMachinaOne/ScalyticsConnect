// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const express = require('express');
const agentController = require('../controllers/agentController');
const { protect, hasPermission } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.get('/', agentController.getAgents);
router.get('/tools', agentController.getMCPTools);
router.get('/:agentId/capabilities', agentController.getAgentCapabilities);
router.post('/chat', agentController.startAgentChat);
router.post('/deep-search', hasPermission('agents:use:deep_search'), agentController.handleDeepSearchRequest);

module.exports = router;
