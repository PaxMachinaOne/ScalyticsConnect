# API Key Management

## Overview

This document outlines the administrative features and responsibilities for managing API keys within the system. The platform supports both global (system-wide) and user-specific API keys, allowing for flexible integration with external AI providers.

## Global API Keys

Global API keys are organization-wide credentials that are automatically available to all users of the system. They provide several benefits:

- **Centralized Management**: Administrators can manage all API access from a single location
- **Cost Control**: Usage can be centrally monitored and controlled
- **Simplified Onboarding**: New users can immediately access external models without setting up their own keys
- **Collaborative Learning**: Creating a shared context across your organization where the models learn from all user inputs collectively

### Collaborative Intelligence

When you provide global API keys for online providers, you're creating a collaborative model that considers all inputs across your users. This means:

- The AI models build on the collective knowledge and queries of your entire organization
- Responses improve over time based on the diversity of your users' interactions
- Common organizational terminology and domain-specific knowledge accumulates in the model context
- Your organization benefits from a cohesive AI experience tuned to your specific needs

### Setting Up Global API Keys

1. Navigate to the Admin Panel
2. Select "Integrations" from the sidebar
3. In the "API Keys" tab, click "Add Global Key"
4. Select the provider (e.g., OpenAI, Anthropic, Mistral)
5. Enter the API key value
6. Click "Save" to store the key

All global keys are automatically encrypted in the database for security.

### Security Considerations

- **Access Control**: Only users with the `api-keys:manage` permission can view or modify global keys
- **Encryption**: All keys are encrypted at rest using industry-standard encryption
- **Usage Tracking**: The system tracks and logs API key usage for audit purposes
- **Key Rotation**: Implement regular rotation of global keys as a security best practice

### Important Security Note

**The admin user (ID 1) does not have access to online model-based chat by design.** This is a security feature to prevent potential privilege escalation. The admin user can still use local models. If admin needs to test online models, create a separate administrator account that is not the system's root admin.

## API Key Precedence

When both global and user-specific keys exist for the same provider:

1. **Global keys take precedence** over user-specific keys
2. The UI clearly indicates when a user's key is being overridden by a global key
3. Both keys remain stored in the database, allowing for quick fallback if needed

## Managing User API Keys

As an administrator, you can:

1. View all user API keys across the system
2. Deactivate individual user keys if necessary
3. Delete user keys in case of compromise
4. Override user keys with global keys when needed

## Debugging and Troubleshooting

The system includes several built-in tools for API key management:

- **Automatic Fixes**: The server runs database fixes at startup to ensure proper key configuration
- **Key Verification**: Tools to verify keys are working properly
- **View Creation**: Special database views are created to optimize API key lookups
- **Error Logging**: Detailed logs for API key operations are maintained

### Fix Scripts

The system includes several critical fix scripts that run automatically:

1. `fix_anthropic_keys.js`: Special handler for Anthropic provider issues
2. `fix_api_key_verification.js`: General key validation & proper indexing
3. `update_group_model_permissions.js`: Ensures administrators have proper access to all models

### Manual Verification

To manually verify API keys are working correctly:

1. Navigate to Admin Panel > System Maintenance
2. Under the "API Keys" section, click "Run Verification"
3. Review the generated report for any issues

## Best Practices

1. **Regular Audits**: Review global and user API keys quarterly
2. **Testing**: After adding new global keys, test with multiple user accounts
3. **Documentation**: Maintain documentation of which global keys are in use
4. **Rate Limiting**: Be aware of provider rate limits when using global keys shared by many users
