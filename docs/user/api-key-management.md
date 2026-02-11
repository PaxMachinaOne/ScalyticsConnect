# API Key Management for Users

## Overview

This guide explains how to manage your API keys for external AI services within the system. The platform allows you to use both organization-provided (global) API keys and your own personal API keys.

## Understanding API Key Types

### Personal API Keys

Personal API keys are credentials that you add to your own account. These keys:

- Are only available to your account
- Allow you to use your own billing relationship with providers
- Can be managed directly through your settings page
- May be useful if you have personal usage credits or specific tier access

### Global API Keys

Global API keys are provided by your organization administrators. These keys:

- Are automatically available to all users
- Do not require any setup on your part
- May override your personal keys for specific providers
- Are maintained and secured by your organization
- Create a collaborative learning environment that benefits the entire organization

#### Benefits of Collaborative Learning

When your organization uses global API keys, a collaborative learning environment is created:

- AI models learn from the combined knowledge and interactions of all users
- This improves response quality for common organizational topics
- The model develops familiarity with your organization's terminology and domain knowledge
- Everyone benefits from a more cohesive and organization-specific AI experience

This is why global keys take precedence over personal keys - to maintain this collaborative learning environment.

## Managing Your API Keys

### Viewing Your API Keys

1. Click on your profile icon in the top right
2. Select "Settings" from the dropdown
3. Navigate to the "API Keys" tab

You'll see a list of your personal API keys and any active global keys.

### Adding a New API Key

1. From the API Keys settings page, locate the "Add New API Key" section
2. Select the provider from the dropdown (e.g., OpenAI, Anthropic)
3. Enter your API key
4. Click "Add API Key"

Your key will be securely encrypted and stored for future use.

### Understanding Key Status Indicators

The API key interface uses visual indicators to help you understand the status of each key:

- **Green Badge**: Active key that is currently being used
- **Amber/Yellow Badge**: Your personal key that is being overridden by a global key
- **Red Badge**: Inactive or disabled key
- **Purple Badge**: Global key provided by your organization

### Working with Global Keys

When a global key exists for a provider:

1. The system will use the global key instead of your personal key
2. Your personal key will be marked as "Overridden" in the interface
3. You'll see a notification in the chat interface indicating which global keys are active
4. Your personal key remains stored and can be activated if the global key is removed

## Troubleshooting

### API Key Not Working

If you experience issues with your API keys:

1. Check if there's a global key overriding your personal key
2. Verify that your key is marked as "Active" in the settings
3. Test the key directly with the provider to ensure it's valid
4. Contact your administrator if you believe there's an issue with a global key

### Security Best Practices

To keep your API keys secure:

1. Never share your personal API keys with others
2. Use unique API keys for different services where possible
3. If you suspect a key has been compromised, deactivate it immediately
4. Consider rotating your API keys periodically for enhanced security

## FAQ

**Q: Why is my personal API key not being used?**  
A: If there's a global key for the same provider, it will take precedence over your personal key. This is indicated by an "Overridden" badge.

**Q: Can I use my personal key instead of the global key?**  
A: No, the system prioritizes global keys when available. This is an organizational policy.

**Q: Will I be charged for usage when a global key is active?**  
A: No, when the system uses a global key, the usage is billed to the organization's account, not your personal account.

**Q: Can I see what global keys are available?**  
A: Yes, global keys are displayed in the "System-wide API Keys" section of your API Key settings page.

**Q: What happens if a global key is removed?**  
A: If your personal key for that provider is active, the system will automatically switch to using it.
