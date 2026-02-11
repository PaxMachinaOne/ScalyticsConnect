// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const privacyController = require('../controllers/privacyController');

// Public routes
router.post('/login', authController.login);

// The verifyRegistrationToken route exists in the controller
router.post('/verify-token', authController.verifyRegistrationToken);

// The setPassword route exists in the controller
router.post('/set-password', authController.setPassword);
router.get('/register-redirect', authController.handleRegisterRedirect); // Handle the GET request for redirect

// Protected routes - requires authentication
router.use(protect);

// Profile routes
router.get('/me', authController.getProfile);
router.get('/profile', authController.getProfile); // Alias for /me

// Settings routes
router.put('/settings', authController.updateSettings);

// Privacy status for all authenticated users
router.get('/privacy-status', privacyController.getPrivacyStatus);

module.exports = router;
