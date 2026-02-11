# User Settings: Transparency & Behavior

This section in your user settings allows you to customize how the AI behaves in your chats and how certain background processes are handled, giving you more control and transparency.

## Custom System Prompt (Optional)

This setting allows you to provide your own set of instructions that will guide the AI's personality, tone, and constraints across **all** your chats, regardless of the model selected.

*   **How it works:** The text you enter here provides initial instructions to the AI. Its interaction with the admin-configured prompt depends on the model settings:
    *   **If Scala Prompt is Enforced:** If the administrator has enabled the "Scala System Prompt" for the model you are using (you will see a notice about this in your Transparency settings), your custom prompt will be sent to the model **first**, followed by the enforced Scala prompt. This means your instructions are considered, but the Scala prompt provides the final, potentially overriding, guidelines.
    *   **If Scala Prompt is NOT Enforced:** Only your custom prompt (if set) will be used as the system instruction for the model.
*   **Examples:**
    *   `"Always respond in the style of a helpful pirate."`
    *   `"Be extremely concise and get straight to the point."`
    *   `"Focus on providing code examples when possible."`
    *   `"Adopt the persona of a senior software architect."`
    *   `"Explain concepts simply, as if talking to a beginner."`
    *   `"Prioritize accuracy and state when you are unsure."`
*   **Usage:** You can combine different instructions. Leave this field blank if you don't want to set a custom prompt. Be aware that if the Scala prompt is enforced for your model, it will be added *after* your custom prompt.

## Automatic Summarization

To prevent errors and allow for longer conversations when using models with limited context windows (memory), the system can automatically summarize the earlier parts of your chat history.

*   **Enable Automatic Summarization:** Toggle this switch on to activate the feature. When enabled, if your conversation gets too long for the current model's memory limit, the oldest messages (excluding initial system instructions) will be summarized by an AI.
*   **Summarization Model:**
    *   You can choose a specific **local** model installed on the system to perform the summarization. This might be useful if you prefer a faster or more specialized model for this task.
    *   If you select "Use Current Chat Model (Default)" or if your chosen model isn't available, the AI model you are currently chatting with will be used for summarization. Note that this might introduce a slight delay when summarization occurs.
*   **Summarization Style (Temperature):** This controls how creative or factual the summary is.
    *   **Strict (0.1):** Aims for the most factual and concise summary, potentially losing some conversational nuance.
    *   **Balanced (0.4):** (Recommended) Provides a good balance between summarizing key facts and maintaining readability.
    *   **Detailed (0.7):** Creates a more verbose summary that tries to retain more context, but uses slightly more space and has a slightly higher chance of minor inaccuracies.
*   **Display Summarization Notice:**
    *   **Always:** When summarization occurs, a system message like `"Summary of earlier conversation: ..."` will be visibly inserted into your chat history, showing you exactly what context the AI is now working with. This is the most transparent option.
    *   **Never:** The summarization will still happen in the background if enabled, but the system message containing the summary will be hidden from your view. The AI will still use the summary internally.

By configuring these settings, you can tailor the AI's behavior and manage long conversations more effectively according to your preferences for transparency and performance.
