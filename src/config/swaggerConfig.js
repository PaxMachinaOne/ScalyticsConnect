// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Scalytics Copilot API',
      version: '4.0.1', 
      description: 'API documentation for Scalytics Copilot, including the OpenAI-compatible Scalytics API.',
    },
    servers: [
      {
        url: '/', 
        description: 'Current Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT', 
          description: 'Enter your Scalytics API Key (prefixed with "Bearer ")'
        }
      }
    },
  },
   apis: ['./src/routes/agentRoutes.js', './src/routes/scalyticsApiRoutes.js'], 
 };
 
const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
