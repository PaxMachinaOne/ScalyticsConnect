# Scalytics Copilot - Version 4

This release introduces significant architectural updates focused on enhancing the Deep Search tool's capabilities and providing greater transparency into agent operations. Key changes include the integration of multilingual support, a new agent reasoning log, and a bot trap detection system for more robust web scraping. The update also includes performance improvements, bug fixes, and dependency updates.

## Major Features

- **Multilingual Support for Deep Search (#135):** The Deep Search functionality has been upgraded to support multiple languages. The system now includes language detection and translation capabilities, allowing it to process queries and sources in various languages.

- **Agent Reasoning Transparency (#128):** A persistent reasoning log has been implemented for the Deep Search agent. This provides a detailed, step-by-step record of the agent's decision-making process, including data retrieval, analysis, and synthesis steps. The logs are available for both real-time and historical review, increasing the transparency of the agent's operations.

## New Features

- **Bot Trap Detection and Timeout Management (#130):** A new system has been implemented to detect and manage unresponsive or malicious domains during web scraping. This feature improves the reliability of data collection by temporarily blacklisting problematic domains.

- **Chat History Summarization (#129):** A summarization service has been added to manage long-running conversations. When a chat history exceeds the context window, the service summarizes the conversation to maintain context.

## Improvements

- **GPU Statistics:** The vLLM service has been enhanced to provide more detailed GPU statistics, including a list of loaded models and the tensor parallel size.

- **Model Activation (#131):** The model activation process has been refactored to improve error handling and provide clearer user feedback.

- **Citation Handling (#127):** The citation generation process in report synthesis has been improved with standardized citation markers and better URL normalization.

- **Reasoning Log Display (#128):** The user interface for the reasoning log has been redesigned for improved clarity and usability.

## Bug Fixes

- **Language Support in Synthesis (#135):** The `processing_language` parameter has been added to the synthesis method to ensure correct handling of different languages.

- **Hardware Information Endpoint (#132):** The `getHardwareInfo` function has been simplified by removing redundant code.

- **Chat Title Editing (#133):** The functionality to edit chat titles has been removed.

- **Reasoning Log Display (#128):** Issues with `task_id` propagation and conditional rendering in the reasoning log display have been resolved.

- **LLM Timeout (#130):** The LLM response timeout has been increased to 300 seconds.

## Dependency Updates

- `axios` has been updated to version `1.12.0`.
- `mermaid` has been updated to version `11.11.0`.
- `brace-expansion` has been updated to version `1.1.12`.
- `form-data` has been updated.
