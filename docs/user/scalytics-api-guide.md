# Using the Scalytics API

The Scalytics API allows you to interact with the local AI models hosted on this Scalytics Connect instance using external tools, scripts, or development environments that support the OpenAI API format.

## What is it for?

You can use the Scalytics API to:

*   Integrate local model access into your own applications or scripts.
*   Use development tools (like code editors with AI plugins) that expect an OpenAI-compatible endpoint, but direct them to use the secure, local models provided here.
*   Experiment with programmatic access to the available local models.

**Important:** The Scalytics API only works with **local models** managed by this instance. It cannot be used to access external services like OpenAI or Anthropic.

## Generating Your API Key

To use the Scalytics API, you first need to generate a personal API key:

1.  Go to your **Settings** page within Scalytics Connect.
2.  Navigate to the **API Keys** section.
3.  Look for the **"Generate Scalytics API Key"** area.
4.  Enter a **Key Name** that helps you remember what you'll use this key for (e.g., "My Laptop Dev Key", "Data Analysis Script").
5.  Click the **"Generate Key"** button.
6.  **Crucial Step:** A new API key (starting with `sk-scalytics-`) will be displayed **only once**. Copy this key immediately and save it somewhere safe, like a password manager. **You will not be able to see this key again.**
7.  Your new key (identified by its name) will appear in your list of personal API keys.

## Using Your API Key

When configuring your external tool or script:

1.  **Endpoint URL:** Set the API endpoint URL to `https://[Your Scalytics Connect URL]/v1/chat/completions`. Replace `[Your Scalytics Connect URL]` with the actual address of this instance.
2.  **API Key:** Provide your generated Scalytics API key (the one starting with `sk-scalytics-`) as the API key or Bearer token. Many tools have a specific field for the API key. If configuring manually, it should be sent in the `Authorization` header like this:
    ```
    Authorization: Bearer YOUR_SCALYTICS_API_KEY
    ```
3.  **Model Name:** You **do not** need to specify a model name in your request. The API automatically uses the single local model configured by the administrator for this service.

## Security

*   **Treat your Scalytics API key like a password.** Do not share it or embed it directly in publicly accessible code.
*   Use descriptive names for your keys so you know what each one is used for.
*   You can delete keys you no longer need from the Settings > API Keys page.

If you suspect a key has been compromised, delete it immediately and generate a new one.

*Note: The availability and overall rate limits (how many total requests can be made by everyone) of the Scalytics API are controlled by the system administrator.*
