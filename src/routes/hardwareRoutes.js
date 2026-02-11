// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const hardwareController = require('../controllers/hardwareController');

// Get all hardware information
router.get('/info', protect, hardwareController.getHardwareInfo);

// Get historical hardware usage data
router.get('/history', protect, hardwareController.getHardwareHistory);

// Force refresh GPU info
router.post('/refresh-gpu', protect, hardwareController.refreshGpuInfo);

module.exports = router;
