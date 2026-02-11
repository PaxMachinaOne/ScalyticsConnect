// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
    const express = require('express');
const router = express.Router();
const oauthController = require('../controllers/oauthController');
const { protect } = require('../middleware/authMiddleware');

// Public routes - need to be accessible for OAuth flow
router.get('/providers', oauthController.getAvailableProviders);
router.post('/callback', oauthController.handleOAuthCallback);

// Protected routes
router.delete('/unlink/:provider', protect, oauthController.unlinkProvider);

module.exports = router;
