// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const axios = require('axios');
const { sanitizePathSegment } = require('../../utils/urlValidation');

const getModelInfo = async (modelId, hfToken = null) => {
  try {
    const headers = {};
    if (hfToken && typeof hfToken === 'string' && hfToken.trim() !== '') {
      headers.Authorization = `Bearer ${hfToken}`;
    } else if (hfToken && typeof hfToken === 'object') {
        // Handle cases where the token might be nested in an object
        const tokenValue = hfToken.token || hfToken.value || hfToken;
        if (typeof tokenValue === 'string' && tokenValue.trim() !== '') {
            headers.Authorization = `Bearer ${tokenValue}`;
        }
    }
    
    // Only make the request if we have a valid authorization header or no token is needed
    const response = await axios.get(`https://huggingface.co/api/models/${sanitizePathSegment(modelId)}`, { headers });
    return response.data;
  } catch (error) {
    console.error("Error fetching model info for %s:", String(modelId).replace(/\n|\r/g, ''), error);
    return null;
  }
};

module.exports = { getModelInfo };
