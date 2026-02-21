# Scalytics API Administration Guide

This guide explains how administrators can manage the Scalytics API feature, which provides an OpenAI-compatible endpoint (`/v1/chat/completions`) for interacting with local models using external tools.

## Feature Overview

The Scalytics API allows users to generate API keys that can be used to authenticate requests against the `/v1/chat/completions` endpoint. This enables integration with development tools, scripts, or other applications that support the OpenAI API format, but restricts usage to the local models hosted within this Scalytics Copilot instance.

## Concurrency and Model Selection

The Scalytics API is designed to handle multiple simultaneous requests efficiently. It achieves this by using a background worker system.

*   **Concurrency:** Incoming API requests are distributed across available worker processes. This allows the system to process several requests in parallel, improving responsiveness under load. The maximum level of concurrency generally depends on the number of available processing units (like GPUs) configured for the active model.
*   **Model Selection:** A crucial point to understand is that the `/v1/chat/completions` endpoint **always** routes requests to the **single local model** that is currently marked as **"Active"** in the Admin Dashboard (under Models -> Local Models). It does not support selecting different local models via the API request itself (e.g., through the `model` parameter in the request body). Ensure the desired model for API access is the one set to active.

## Configuration

Administrators control the global status and rate limiting of the Scalytics API via the Admin Dashboard.

1.  **Navigate to Admin Dashboard:** Access the main administrative area.
2.  **Select "Scalytics API" Tab:** Find and click on the "Scalytics API" tab in the admin navigation.
3.  **Enable/Disable API:**
    *   Use the **"Enable Scalytics API Access"** toggle switch.
    *   **Enabled (Default: Disabled):** The `/v1/chat/completions` endpoint is active and will process valid requests.
    *   **Disabled:** The endpoint will return a `503 Service Unavailable` error, effectively disabling the feature globally.
4.  **Configure Rate Limiting:**
    *   **Time Window (Minutes):** Set the duration (in minutes) over which the **total** request limit for the `/v1/chat/completions` endpoint is applied.
    *   **Max Requests per Window:** Set the maximum **total** number of requests allowed across *all users* for the endpoint within the defined time window. Setting this to `0` might disable rate limiting, but it's recommended to keep a reasonable limit to prevent abuse.
    *   This global limit helps protect the overall server resources from being overwhelmed by API usage.
5.  **Save Settings:** Click the "Save Settings" button to apply any changes to the toggle or rate limits.

## Managing User API Keys

While users generate their own Scalytics API keys via their personal settings page, administrators have oversight and can manage these keys for security and operational purposes (e.g., when a user leaves the organization).

1.  **Navigate to Admin Dashboard:** Access the main administrative area.
2.  **Select "API Keys" Tab:** Go to the section where user API keys are listed (this might be under "Providers" or a dedicated "API Keys" section depending on the exact UI layout).
3.  **Identify Scalytics Keys:** Look for keys associated with the "Scalytics API" provider. The list should indicate which user generated the key.
4.  **Manage Keys:**
    *   **View:** You can see the key name, associated user, and creation date. The actual key value (token) is hashed and not displayed for security.
    *   **Delete:** Use the delete button (trash icon) next to a specific key to permanently revoke it. This is the primary action for disabling a specific user's API access if needed. *Note: Scalytics API keys do not have an activate/deactivate status like external provider keys; their usability is controlled by the global toggle and their existence.*

## Security Considerations

*   **Key Security:** Remind users that Scalytics API keys should be treated like passwords and kept confidential. Deleting a user's key is the way to revoke their specific access.
*   **Rate Limiting:** Monitor overall API usage patterns (e.g., via logs or system monitoring) and adjust the global rate limits as necessary to balance usability and protect server resources.
*   **Global Toggle:** Use the global disable switch when the API feature needs to be temporarily or permanently deactivated for maintenance or security reasons.
*   **System Prompts:** Note that the Scalytics API endpoint (`/v1/chat/completions`) does **not** automatically apply any system prompts or profiles configured for the local model within the main Scalytics Copilot UI. For API usage, any desired system prompt must be explicitly included by the client application as the first message in the `messages` array with `role: "system"`. This ensures compatibility with standard OpenAI client behavior.

## Connecting to a Remote Scalytics Instance

You can configure this Scalytics Copilot instance to use the models hosted on *another* Scalytics Copilot instance. This is achieved by treating the remote instance's Scalytics API as an external provider and using a Global API Key.

**Prerequisites:**

*   Access to the *remote* Scalytics Copilot instance.
*   An API key generated on the *remote* instance (via Settings -> API Keys -> Generate Scalytics API Key).
*   The base URL of the *remote* instance (e.g., `https://remote-scalytics.yourcompany.com`).

**Steps:**

1.  **Generate Remote API Key:**
    *   Log in to the *remote* Scalytics instance.
    *   Navigate to your user **Settings** page.
    *   Go to the **API Keys** section.
    *   Under "Generate Scalytics API Key", enter a descriptive name (e.g., "Key for Main Instance") and click **Generate Key**.
    *   **Immediately copy the generated API key.** It will not be shown again.

2.  **Add New Provider (Current Instance):**
    *   Log in to the *current* Scalytics instance (the one you want to configure).
    *   Navigate to the **Admin Dashboard**.
    *   Go to the **Providers** tab (usually under "Providers & Keys" or similar).
    *   Click **Add Provider**.
    *   **Name:** Give it a descriptive name (e.g., "Remote Scalytics Prod", "Scalytics Staging").
    *   **Description:** (Optional) Add details about the remote instance.
    *   **API URL:** Enter the **base URL** of the *remote* Scalytics instance (e.g., `https://remote-scalytics.yourcompany.com`). **Do not** add `/v1/chat/completions` here; the system expects the base URL.
    *   **Website:** (Optional) Can be the same as the API URL or the main login page.
    *   **Endpoints:** Leave these blank. The system will use the standard OpenAI-compatible paths relative to the API URL provided.
    *   **Active:** Ensure this is checked (enabled).
    *   Click **Add Provider**.

3.  **Add Global API Key (Current Instance):**
    *   Navigate to the **Admin Dashboard**.
    *   Go to **Integrations**.
    *   Select the **Global API Keys** sub-tab.
    *   Click **Add Global Key**.
    *   **Provider:** Select the provider name you created in step 2 (e.g., "Remote Scalytics Prod").
    *   **Key Name:** Give it a descriptive name (e.g., "Global Key for Remote Prod").
    *   **API Key:** Paste the API key you generated and copied from the *remote* instance in step 1.
    *   Click **Save Key**.

**Result:**

*   The *current* Scalytics instance will now treat the *remote* instance like any other external API provider.
*   Models hosted on the remote instance should become available for selection within the current instance (assuming the Global API key is valid and the remote instance's API is enabled).
*   All users on the *current* instance will use this Global API Key when interacting with models provided by the remote instance.
