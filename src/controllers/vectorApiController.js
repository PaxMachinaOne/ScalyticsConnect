// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const axios = require('axios');
const { getSystemSetting } = require('../config/systemConfig');
const { APIError } = require('../utils/errorUtils');
const { validateInternalServiceUrl } = require('../utils/urlValidation');

/**
 * Handles requests to embed texts using the Python vector service.
 */
exports.embedTextsHandler = async (req, res, next) => {
  const { texts, model_identifier } = req.body; // model_identifier is optional

  if (!Array.isArray(texts) || texts.length === 0 || !texts.every(t => typeof t === 'string')) {
    return next(new APIError('Invalid input: "texts" must be a non-empty array of strings.', 400));
  }

  try {
    const pythonServiceBaseUrl = getSystemSetting('PYTHON_DEEP_SEARCH_BASE_URL', 'http://localhost:8001');
    const embedApiUrl = validateInternalServiceUrl(pythonServiceBaseUrl, '/vector/embed-texts');
    
    console.log("[VectorAPIController] Requesting embeddings for %d texts from %s. Model hint: %s", Number(texts.length), embedApiUrl, String(model_identifier || 'default').replace(/\n|\r/g, ''));

    const apiResponse = await axios.post(embedApiUrl, {  // lgtm[js/request-forgery] URL validated via validateInternalServiceUrl
      texts: texts,
      model_identifier: model_identifier // Pass it along, Python service might use it or its default
    });

    if (!apiResponse.data || !Array.isArray(apiResponse.data.embeddings) || typeof apiResponse.data.dimension !== 'number' || !apiResponse.data.model_used) {
      console.error("[VectorAPIController] Invalid response structure from Python embedding service:", apiResponse.data);
      return next(new APIError("Invalid response format from Python embedding service.", 500));
    }
    
    // Forward the Python service's response to the client
    res.status(200).json({
      success: true,
      data: apiResponse.data // Contains embeddings, model_used, dimension
    });

  } catch (error) {
    const statusCode = error.response?.status || 500;
    const message = error.response?.data?.detail || error.message || 'Failed to embed texts via Python service.';
    console.error('[VectorAPIController] Error calling Python embedding service: Status %s, Message: %s', statusCode, message, error.response?.data || error);
    return next(new APIError(message, statusCode));
  }
};

/**
 * Handles requests to add documents to the Python vector service.
 */
exports.addDocumentsHandler = async (req, res, next) => {
  const { documents, group_id } = req.body;

  if (!group_id || typeof group_id !== 'string') {
    return next(new APIError('Invalid input: "group_id" must be a non-empty string.', 400));
  }
  if (!Array.isArray(documents) || documents.length === 0) {
    return next(new APIError('Invalid input: "documents" must be a non-empty array.', 400));
  }
  // Basic validation for document structure
  for (const doc of documents) {
    if (typeof doc.text_content !== 'string' || !doc.text_content.trim()) {
      return next(new APIError('Invalid input: Each document must have a non-empty "text_content" string.', 400));
    }
    if (doc.metadata && typeof doc.metadata !== 'object') {
      return next(new APIError('Invalid input: Document "metadata", if provided, must be an object.', 400));
    }
    // 'id' is optional for GenericDocumentItem as it has a default_factory in Python
  }

  try {
    const pythonServiceBaseUrl = getSystemSetting('PYTHON_DEEP_SEARCH_BASE_URL', 'http://localhost:8001');
    const addDocsApiUrl = validateInternalServiceUrl(pythonServiceBaseUrl, '/vector/documents');
    
    console.log("[VectorAPIController] Requesting to add %d documents to group %s via %s.", Number(documents.length), String(group_id).replace(/\n|\r/g, ''), addDocsApiUrl);

    const apiResponse = await axios.post(addDocsApiUrl, {  // lgtm[js/request-forgery] URL validated via validateInternalServiceUrl
      documents: documents, // These should match Python's GenericDocumentItem structure
      group_id: group_id
    });

    // Python service returns GeneralVectorResponse: { success: bool, message: str, details: Optional[Dict] }
    if (typeof apiResponse.data?.success !== 'boolean' || typeof apiResponse.data?.message !== 'string') {
      console.error("[VectorAPIController] Invalid response structure from Python add documents service:", apiResponse.data);
      return next(new APIError("Invalid response format from Python add documents service.", 500));
    }
    
    res.status(apiResponse.data.success ? 200 : 400).json(apiResponse.data); // Forward Python's success/failure & message

  } catch (error) {
    const statusCode = error.response?.status || 500;
    const message = error.response?.data?.detail || error.response?.data?.message || error.message || 'Failed to add documents via Python service.';
    console.error('[VectorAPIController] Error calling Python add documents service: Status %s, Message: %s', statusCode, message, error.response?.data || error);
    return next(new APIError(message, statusCode));
  }
};

/**
 * Handles requests to search vector documents using the Python vector service.
 */
exports.searchVectorsHandler = async (req, res, next) => {
  const { query_text, group_id, top_k } = req.body;

  if (!query_text || typeof query_text !== 'string') {
    return next(new APIError('Invalid input: "query_text" must be a non-empty string.', 400));
  }
  if (group_id && typeof group_id !== 'string') {
    return next(new APIError('Invalid input: "group_id", if provided, must be a string.', 400));
  }
  if (top_k && (typeof top_k !== 'number' || !Number.isInteger(top_k) || top_k < 1 || top_k > 100)) {
    return next(new APIError('Invalid input: "top_k", if provided, must be an integer between 1 and 100.', 400));
  }

  try {
    const pythonServiceBaseUrl = getSystemSetting('PYTHON_DEEP_SEARCH_BASE_URL', 'http://localhost:8001');
    const searchApiUrl = validateInternalServiceUrl(pythonServiceBaseUrl, '/vector/search');
    
    const payload = { query_text };
    if (group_id) payload.group_id = group_id;
    if (top_k) payload.top_k = top_k;

    console.log("[VectorAPIController] Requesting vector search via %s with query '%s'.", searchApiUrl, String(query_text).replace(/\n|\r/g, ''));

    const apiResponse = await axios.post(searchApiUrl, payload); // lgtm[js/request-forgery] URL validated via validateInternalServiceUrl

    // Python service returns VectorSearchResponse: { success: bool, message: str, results: List[VectorSearchResultItem] }
    if (typeof apiResponse.data?.success !== 'boolean' || 
        typeof apiResponse.data?.message !== 'string' || 
        !Array.isArray(apiResponse.data?.results)) {
      console.error("[VectorAPIController] Invalid response structure from Python vector search service:", apiResponse.data);
      return next(new APIError("Invalid response format from Python vector search service.", 500));
    }
    
    res.status(apiResponse.data.success ? 200 : 400).json(apiResponse.data);

  } catch (error) {
    const statusCode = error.response?.status || 500;
    const message = error.response?.data?.detail || error.response?.data?.message || error.message || 'Failed to search vectors via Python service.';
    console.error('[VectorAPIController] Error calling Python vector search service: Status %s, Message: %s', statusCode, message, error.response?.data || error);
    return next(new APIError(message, statusCode));
  }
};

/**
 * Handles requests to delete vector documents by group_id using the Python vector service.
 */
exports.deleteVectorGroupHandler = async (req, res, next) => {
  const { group_id } = req.body;

  if (!group_id || typeof group_id !== 'string') {
    return next(new APIError('Invalid input: "group_id" must be a non-empty string.', 400));
  }

  try {
    const pythonServiceBaseUrl = getSystemSetting('PYTHON_DEEP_SEARCH_BASE_URL', 'http://localhost:8001');
    const deleteGroupApiUrl = validateInternalServiceUrl(pythonServiceBaseUrl, '/vector/delete_by_group');
    
    console.log("[VectorAPIController] Requesting to delete vector documents for group %s via %s.", String(group_id).replace(/\n|\r/g, ''), deleteGroupApiUrl);

    const apiResponse = await axios.post(deleteGroupApiUrl, {  // lgtm[js/request-forgery] URL validated via validateInternalServiceUrl
      group_id: group_id
    });

    // Python service returns GeneralVectorResponse: { success: bool, message: str, details: Optional[Dict] }
    if (typeof apiResponse.data?.success !== 'boolean' || typeof apiResponse.data?.message !== 'string') {
      console.error("[VectorAPIController] Invalid response structure from Python delete_by_group service:", apiResponse.data);
      return next(new APIError("Invalid response format from Python delete_by_group service.", 500));
    }
    
    res.status(apiResponse.data.success ? 200 : 400).json(apiResponse.data);

  } catch (error) {
    const statusCode = error.response?.status || 500;
    const message = error.response?.data?.detail || error.response?.data?.message || error.message || 'Failed to delete vector group via Python service.';
    console.error('[VectorAPIController] Error calling Python delete_by_group service: Status %s, Message: %s', statusCode, message, error.response?.data || error);
    return next(new APIError(message, statusCode));
  }
};
