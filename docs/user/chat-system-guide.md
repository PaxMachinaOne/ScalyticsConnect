# Chat System in Scalytics Copilot

## Overview

Scalytics Copilot provides a versatile chat interface that allows you to interact with various AI models. The system is designed to support both external API-based chat services and local models, giving you flexibility in how you use AI capabilities.

## Key Features

- **Rich Markdown Support**: The chat interface supports full markdown formatting including lists, code blocks, tables, and more
- **Multiple External Providers**: Connect to various external AI providers simultaneously
- **Local Model Integration**: Run a local model for privacy-sensitive operations
- **Seamless Conversation Management**: Create, rename, and organize your chats easily

## Understanding Chat Providers

Scalytics Copilot uses a provider-based architecture for its chat system:

### External Providers

Scalytics Copilot can connect to multiple external AI providers simultaneously, including:

- **OpenAI** (GPT models)
- **Anthropic** (Claude models)
- **Mistral AI**
- **Cohere**
- **Google AI** (Gemini models)

Each external provider requires its own API key, which you can configure in the settings. Having multiple providers gives you options for:

- Comparing different AI models' responses
- Using specialized models for specific tasks
- Fallback options if one service is unavailable
- Cost optimization between different providers

### Local Model

While you can connect to multiple external providers, Scalytics Copilot supports **only one local model** at a time. The local model:

- Runs directly on your hardware
- Provides complete privacy (no data sent to external servers)
- Works offline when needed
- May have different performance characteristics depending on your hardware

The local model is limited to one instance due to resource constraints, as running multiple large language models simultaneously would require significant computational resources.

## Starting a Chat

1. Click the "New Chat" button in the sidebar
2. Select a model from the available providers
3. Start typing your message in the input field at the bottom
4. Press Enter to send your message

## Managing Your Chats

- **Rename a Chat**: Click on the chat title to edit it
- **Switch Between Chats**: Select any chat from the sidebar list
- **Delete a Chat**: Use the options menu (⋮) next to the chat in the sidebar

## Summarizing Chat History (`/sum` command)

For long conversations, the chat history can become extensive, potentially exceeding the context window limits of some AI models or making it harder for the AI to focus on the most recent parts of the discussion. To manage this, you can use the `/sum` command.

**How to Use:**

1.  In the chat input field, type exactly `/sum` and press Enter.
2.  The system will then process the current chat history and generate a concise summary of the conversation up to that point.
3.  A new system message will be inserted into the chat, like:
    `Summary of conversation up to this point (user-triggered): [Generated Summary Text]`
4.  This summary acts as a "checkpoint." Future interactions and any automatic summarization (see below) will consider the conversation from this checkpoint onwards.

**Benefits:**

-   **User Control:** You decide when to condense the history.
-   **Context Management:** Helps keep the active context relevant and manageable for the AI.
-   **Non-Destructive:** The original messages are still part of the chat history; the summary is added as a new system message.

**Automatic Summarization:**

In addition to the manual `/sum` command, Scalytics Copilot also has an automatic summarization feature. If a conversation becomes very long and approaches the AI model's context limit, the system will automatically summarize earlier parts of the chat to ensure new messages can be processed. This automatic summary will also appear as a system message, typically like: `[System Note: Earlier parts of this conversation have been summarized to conserve context space.]`. The `/sum` command allows you to create these summary points proactively.

## Sharing Chats (Read-Only)

You can share your conversations with other users within Scalytics Copilot, granting them read-only access.

**How to Share:**

1.  **Open the Chat:** Select the chat you wish to share from your "My Chats" list.
2.  **Click the Share Icon:** In the chat header (if visible), click the Share icon (↗️). This button is only visible if you are the owner of the chat.
3.  **Invite Users:**
    *   A modal window will appear.
    *   Use the search bar to find users by username or email.
    *   Click the "Invite" button next to the desired user. An invitation will be sent.
4.  **Manage Shares:**
    *   The modal also lists users who currently have access or pending invitations.
    *   You can "Cancel" a pending invitation or "Remove" access for an active share.

**Receiving Shared Chats:**

1.  **Invitations:** If someone shares a chat with you, it will appear in the "Invitations" section at the top of your chat list sidebar.
2.  **Accept/Decline:** You can choose to "Accept" or "Decline" the invitation.
3.  **Accessing Shared Chats:** Once accepted, the chat will appear in the "Shared With Me" section of your sidebar. Shared chats are marked with a distinct icon (📝) and show the owner's username.
4.  **Read-Only Access:** You can view the entire conversation history, but you cannot send new messages or interact with the AI in a shared chat. The input area will be replaced with a "read-only access" message, and the chat header (with title editing, model info, etc.) will be hidden.

**Chat List Organization:**

Your chat list sidebar is organized into collapsible sections:

- **Invitations:** Shows pending chat share requests from other users.
- **My Chats:** Lists the chats you own.
- **Shared With Me:** Lists chats owned by others that you have accepted access to.

You can click the header of each section to expand or collapse it.

## Formatting Messages

You can use Markdown syntax in your messages to format content:

- **Bold**: `**bold text**`
- **Italic**: `*italic text*`
- **Code**: `` `inline code` `` or code blocks with triple backticks
- **Lists**: Use `- ` for bullet points or `1. ` for numbered lists
- **Tables**: Standard Markdown table syntax is supported
- **Headings**: Use `#` for heading level 1, `##` for level 2, etc.

## Image Generation

The chat system supports generating images directly within your conversations using compatible AI models. This allows you to visualize ideas, create assets, or simply explore creative possibilities.

### How to Generate Images

To generate an image, you typically select a model that has image generation capabilities (often indicated by "image" or "vision" in its name) and provide a descriptive prompt of the image you want to create. The system will then process your request and display the generated image in the chat.

For example, you could type: "A futuristic cityscape at sunset with flying vehicles."

### Supported Providers and Availability

Currently, image generation is supported through the following external AI providers:

*   **OpenAI (DALL·E models):** Widely available.
*   **xAI (Grok models with image capabilities):** Widely available.
*   **Google (Gemini models with image capabilities):** Please note that Google's Gemini image generation capabilities may have regional restrictions and are **not currently available in Europe, the Middle East, and Africa (EMEA)**. Users in these regions may not be able to use Gemini for image generation.

Always ensure the selected model supports image generation. If you attempt to generate an image with a model that does not have this capability, you may receive an error or an unexpected text response.

### Tips for Image Prompts

*   **Be Descriptive:** The more detail you provide, the better the AI can understand your vision. Include subjects, actions, artistic styles, colors, lighting, and composition.
*   **Experiment:** Try different phrasings and levels of detail.
*   **Specify Style:** You can request specific artistic styles, such as "photorealistic," "impressionist painting," "pixel art," "cartoon," etc.

## Best Practices

- **Choose the Right Provider**: Different providers excel at different tasks
- **Use Local Model for Sensitive Data**: When working with confidential information
- **Optimize Prompts**: Clear, specific instructions yield better results
- **Leverage Markdown**: Structured inputs often lead to better-formatted outputs

## Troubleshooting

- If a model is unavailable, try switching to another provider
- For local model issues, check system resources and model configuration
- API key errors for external providers usually require updating the key in settings

## Providing Feedback

When interacting with an Assistant message, you will see thumbs-up (👍) and thumbs-down (👎) icons appear when you hover near the message. You can use these icons to provide feedback on the quality of the response:

- **Thumbs Up (👍)**: Click this if the response was helpful, accurate, and well-reasoned.
- **Thumbs Down (👎)**: Click this if the response was unhelpful, inaccurate, contained hallucinations, or had poor reasoning.

**How it Works:**

- You can click either button once to register your feedback.
- To change your feedback, simply click the other button.
- To clear your feedback, click the currently selected button again.

**Why Provide Feedback?**

Your feedback is crucial for improving the AI models within Scalytics Copilot. Specifically, we use this data to:

- **Optimize Reasoning:** Identify patterns in responses that demonstrate strong or weak logical reasoning, helping us fine-tune the models for better problem-solving.
- **Reduce Hallucinations:** Detect instances where the model generates incorrect or fabricated information, allowing us to adjust parameters to improve factual accuracy.
- **Enhance Helpfulness:** Understand which types of responses users find most valuable for their tasks.
- **Immediate Correction (Local Models - Negative Feedback):** If you provide negative feedback (👎) on a response from a *local model*, the system automatically instructs the model on its *next turn* to pay closer attention to factual accuracy and grounding based on the provided context. (Note: Positive feedback 👍 is collected for potentially later refinements).

By providing feedback, you directly contribute to making the AI assistants more reliable and effective.
