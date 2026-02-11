# Scalytics Deep Search - User Guide

Scalytics Deep Search (also known as "Scalytics Deep Search") allows you to perform in-depth research by combining web search results and information from uploaded documents to answer your queries.

## Accessing Scalytics Deep Search

You can typically find the Scalytics Deep Search page in the main sidebar navigation menu, provided the feature is enabled by your administrator and you have the necessary permissions. If you don't see it, please contact your administrator.

## How it Works

When you submit a query:

1.  **Search:** Scalytics Connect performs web searches using DuckDuckGo for general information and OpenAlex for academic/scholarly content. It can optionally use Google Search or Bing Search if configured by your admin and you have API keys set. It also scans any files you uploaded.
2.  **Chunking & Embedding:** Relevant text snippets (chunks) from the search results and files are extracted and converted into numerical representations (embeddings) using a specialized local model configured by your administrator.
3.  **Similarity Search:** The system finds the text chunks most relevant to your original query based on their embeddings.
4.  **Analysis & Synthesis:** The most relevant chunks are sent to a Large Language Model (LLM) that you select, along with your original query.
5.  **Answer:** The LLM analyzes the context and generates a comprehensive answer or summary based on the provided information.

## Using the Scalytics Deep Search Page

1.  **Select Analysis Models:**
    *   **External Analysis Model:** Choose a model like GPT-4, Claude, Gemini, etc., hosted by an external provider. Requires API keys to be configured (either globally by admin or personally by you in **Settings -> API Keys**). *Note: Use of external models may be restricted by admin settings like Privacy Mode or Air Gap Mode.*
    *   **Local Analysis Model:** Choose a model hosted locally on this Scalytics Connect instance. These are typically available even if external access is restricted.
2.  **Enter Your Query:** Type your research question or topic into the main text area. Be as specific as possible.
3.  **(Optional) Add Files:** Click the paperclip icon next to the magnifier glass icon and select "Add Files". You can upload documents to be included in the search context.
    *   **Supported Formats for Analysis:** The system can effectively process and understand text-based documents such as PDF (text-based, not scanned images), DOCX, TXT, MD, CSV, JSON, and XLSX. These formats allow for reliable text extraction, chunking, and analysis.
    *   **Limitations:** Please note that scanned documents (image-based PDFs or other image files without OCR) or documents with highly non-standard, complex structures (e.g., intricate layouts, many embedded objects that are not text) may not be processed effectively. The system relies on extracting textual content for its analysis.
    *   To remove uploaded files before running the task, click the 'x' next to their name in the list.
4.  **(Optional) Select Additional Web Source:**
    *   By default, DuckDuckGo is used for web searches.
    *   If your administrator has enabled Google Search or Bing Search and the necessary API keys are configured (either globally or by you in Settings), you can select one as an *additional* source from the dropdown.
5.  **(Optional) Adjust Number of Links:** Use the slider to control how many web search results (links) are fetched and processed (default is 5). More links provide more context but may take longer.
6.  **Run Task:** Click the send button (up arrow icon).
7.  **View Results:** The process may take some time depending on the query complexity, number of sources, and selected models. The results, including the generated answer and cited sources, will appear in the chat interface.
8.  **Stop Generation:** If needed, you can click the stop button (square icon) while the models are generating the final answer.

## Tips for Effective Use

*   **Be Specific:** Clear, detailed queries yield better results.
*   **Combine Sources:** Uploading relevant documents alongside your web query can provide richer context.
*   **Check Sources:** Review the cited sources provided with the answer to verify information.
*   **Model Choice:** Experiment with different Local and External Analysis Models to see which provides the best synthesis for your needs (subject to availability and admin restrictions).
*   **API Keys:** Ensure you have added your personal API keys in **Settings -> API Keys** if you want to use external models or search providers that aren't configured globally by your administrator.
