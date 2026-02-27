// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const githubController = require('../controllers/githubController');
const { protect } = require('../middleware/authMiddleware');

const githubLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting before authentication to prevent brute-force attacks
router.use(githubLimiter);
router.use(protect);

// GitHub OAuth routes
router.post('/connect', githubController.connectAccount);
router.post('/disconnect', githubController.disconnectAccount);
router.get('/status', githubController.getConnectionStatus);

// GitHub API routes
router.get('/repositories', githubController.getRepositories);
router.get('/content', githubController.getRepositoryContent);
router.get('/file', githubController.getFileContent);

module.exports = router;
