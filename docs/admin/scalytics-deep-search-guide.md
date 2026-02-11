# Scalytics Deep Search (Seek) - Administrator Guide

Scalytics Deep Search (also known as "Scalytics Deep Search") is an advanced feature allowing users to perform research queries that leverage both web search results and uploaded documents. This guide explains how administrators can configure and manage this feature.

## 1. Enabling/Disabling Deep Search

The entire Deep Search feature can be enabled or disabled globally for the instance:

1.  Navigate to **Admin Panel -> Local Tools**.
2.  Locate the **Scalytics Deep Search** tool in the list/tile view.
3.  Use the toggle switch to enable or disable the tool.
    *   **Enabled (Green):** The "Scalytics Deep Search" page is accessible to permitted users.
    *   **Disabled (Red):** The "Scalytics Deep Search" page is hidden, and the backend API endpoint will reject requests.

## 2. Configuring the Embedding Model

Deep Search requires a locally hosted text embedding model to convert text chunks (from web results and files) into vectors for similarity search. This process runs entirely on the **CPU** using the `sentence-transformers` Python library, separate from the LLM inference worker pool.

**a) Prerequisites:**

*   Ensure the `sentence-transformers` library is installed in your Python environment:
    ```bash
    # Navigate to your project root
    # Activate your virtual environment (e.g., source venv/bin/activate)
    pip install -r scripts/requirements.txt
    ```

**b) Downloading an Embedding Model:**

1.  Navigate to **Admin Panel -> Hugging Face**.
2.  Select **"Embedding Models"** from the "Model Family" dropdown. This will display a curated list of recommended text embedding models suitable for CPU execution. Popular choices include:
    *   `sentence-transformers/all-MiniLM-L6-v2` (Fast, good performance)
    *   `BAAI/bge-small-en` (Excellent retrieval performance)
    *   `intfloat/e5-small-v2` (Balanced modern choice)
    *   Multilingual options like `sentence-transformers/paraphrase-multilingual-mpnet-base-v2` are also available in the list.
3.  Select the desired model from the list.
4.  Click **"Download & Install"**. The model files will be downloaded to your server's `models` directory.
5.  **Automatic Configuration:** When the download completes, the system will automatically detect if it's one of the known recommended embedding models and configure it in the database by setting the `is_embedding_model` flag and the correct `embedding_dimension`.

**c) Setting the System-Wide Embedding Model:**

1.  Navigate to **Admin Panel -> Models**.
2.  Locate the downloaded local embedding model you wish to use (it will be marked with a purple icon and "Local Embedding" type).
3.  If the model is not the current default (Status will be "Inactive (Not Preferred)"), click the **"Set as System Embedding Model"** button (checkmark icon) in the Actions column.
4.  **Important:** After setting a new preferred embedding model, you **must restart the Scalytics Connect server** for the change to take effect and the new model to be loaded by the embedding worker.

**d) CRITICAL WARNING: Changing the Embedding Model Post-Initialization**

> **WARNING:** Once you have initialized Deep Search and indexed content with a specific embedding model, **changing to a different embedding model is highly problematic and can lead to data corruption and errors.**
>
> *   **Dimension Mismatch:** Different embedding models produce vectors (embeddings) of different dimensions (e.g., Model A might produce 384-dimensional vectors, while Model B produces 768-dimensional vectors).
> *   **Database Incompatibility:** The vector database (LanceDB) schema is established based on the dimension of the *first* embedding model used. If you switch models, newly generated embeddings will have a different dimension than those already stored.
> *   **Errors:** This dimension mismatch will cause errors during data indexing and retrieval, such as `pyarrow.lib.ArrowInvalid: ListType can only be casted to FixedSizeListType if the lists are all the expected size.` This occurs because the database expects all vectors in a given table to have the same, fixed dimension.
>
> **If you absolutely must change the embedding model after data has been indexed:**
>
> 1.  **Backup Your Data:** Ensure you have backups if the existing indexed data is critical.
> 2.  **Clear Existing Vector Data:** The safest approach is to delete the existing vector table used by Deep Search. This will remove all previously indexed vectors. The table will be recreated with the new model's embedding dimension when Deep Search is next used.
>     *   The table is typically located at `data/mcp_tools/deep_search_vector_store`. Deleting the specific table directory (e.g., `deep_search_vector_store.lance`) within the base path would effectively clear it.
> 3.  **Re-index Content:** Any content previously processed by Deep Search (e.g., from user uploads or past research) will need to be re-indexed with the new model to be searchable.
>
> **Recommendation:** Choose your embedding model carefully during initial setup and avoid changing it unless absolutely necessary and you are prepared to handle the data migration/re-indexing process.

## 2.1. Configuring for Multilingual Support

By default, Deep Search is optimized for English queries. However, it can be configured to support queries in other languages. This is controlled by the embedding model in use and a specific configuration flag.

**Behavior Modes:**

1.  **English-Only (Default):** If a non-English query is received and the system is not configured for multilingual support, the system will automatically:
    *   Translate the user's query into English.
    *   Perform the entire research process in English.
    *   Translate the final English report back into the user's original language.
    This ensures the user always gets a result, though the translation steps may introduce minor inaccuracies.

2.  **Multilingual (Recommended for non-English queries):** If a multilingual embedding model is active and the system is configured for it, the system will:
    *   Perform a hybrid search in both the user's native language and English to maximize result quality.
    *   Translate any retrieved English content into the user's language on the fly.
    *   Synthesize the final report directly in the user's native language.

**Configuration Steps:**

1.  **Select a Multilingual Embedding Model:** Follow the steps in section 2b to download and activate a multilingual embedding model, such as `sentence-transformers/paraphrase-multilingual-mpnet-base-v2`.
2.  **Enable the Multilingual Flag:**
    *   Open the `src/python_services/deep_search_service/config.py` file.
    *   Locate the `DEEP_SEARCH_EMBEDDING_MODEL_IS_MULTILINGUAL` setting.
    *   Change its value from `False` to `True`.
    *   Save the file and restart the Scalytics Connect server for the change to take effect.

## 3. Configuring Search Providers

Deep Search uses external web search providers to gather information.

*   **DuckDuckGo:** Used by default for general web searches if no other API-based general provider is configured or selected by the user. Requires no API key.
*   **OpenAlex:** Used by default for academic/scholarly information. Requires no specific API key configuration.
*   **Brave Search, Google Search, Bing Search (Recommended for Reliability):** These providers use official APIs and are generally more reliable for consistent, high-volume use. They require API key configuration.
    1.  Navigate to **Admin Panel -> API Providers**.
    2.  Locate "Google Search" and/or "Bing Search" under **External Providers**.
    3.  Ensure they are **Active**.
    4.  Click **"Set API Key"** for the desired provider.
    5.  Enter the required API Key (and Custom Search Engine ID for Google, if applicable).
    6.  Save the key.

Users will only see the option to use Brave/Google/Bing on the Scalytics Deep Search page if the provider is active *and* a global API key is set here (or if the user adds their own personal key in their settings).

**Note on Search Provider Reliability:**

While DuckDuckGo is available without an API key, it can be prone to rate-limiting or blocking with frequent use, which may lead to inconsistent search results or failures. For production environments or heavy Deep Search usage, **it is highly recommended to configure and enable API-based search providers like Brave Search, Google Custom Search, or Bing Web Search.** These services are designed for programmatic access and offer greater reliability and higher request quotas (though they may involve costs depending on usage).

## 4. Privacy Mode and Air Gap Mode Considerations

*   **Embedding Generation:** Uses a local model running on the CPU via a dedicated worker. It is **not** affected by Privacy Mode or Air Gap Mode.
*   **External Search Providers (Google/Bing):**
    *   **Not** affected by **Privacy Mode**. If enabled and keys are present, they can be used.
    *   **Are** disabled by **Air Gap Mode**.
*   **External LLM Analysis:**
    *   The final step of Deep Search involves using an LLM (selected by the user on the Seek page) to analyze the retrieved context.
    *   If the user selects an **External** LLM (e.g., GPT-4, Claude), this analysis step **is** subject to both **Privacy Mode** and **Air Gap Mode**. If either mode is enabled, external LLM analysis will be blocked, and the user must select a **Local** analysis model.

## 5. User Permissions

To use the Scalytics Deep Search feature, users (or the groups they belong to) must have the `agents:use:deep_search` permission key assigned. Manage permissions via **Admin Panel -> Users** or **Admin Panel -> Groups**.
