# OAuth Integration Guide

This guide covers the OAuth integration features of Scalytics Connect, including security considerations for administrators.

## Overview

Scalytics Connect supports OAuth integration with several identity providers to enable single sign-on (SSO) functionality. When enabled, users can authenticate using their accounts from supported providers such as GitHub, Google, Microsoft, Azure AD, or Okta.

## Supported Providers

The system supports the following OAuth providers (in order of priority):

1. GitHub
2. Google
3. Microsoft (Personal Accounts)
4. Azure Active Directory (Organizational Accounts)
5. Okta

## Security Considerations

### Admin Access Protection

**IMPORTANT**: The system maintains password authentication as a fallback mechanism for administrators even when OAuth is enabled. This is a critical security feature to prevent admin lockout situations.

When OAuth is enabled:

- Normal users will be directed to authenticate with the configured OAuth provider
- Administrators still have the option to use password authentication
- The login page will display both OAuth and password login options

### Potential Admin Lockout Scenario

Without a password fallback, the following scenario could occur:

1. Admin enables OAuth (e.g., GitHub authentication)
2. Admin logs out of the system
3. Admin attempts to log back in using the OAuth provider
4. The system creates a new user account linked to the OAuth identity but without admin privileges
5. The original admin account becomes inaccessible, resulting in an admin lockout

Our system prevents this scenario by:
- Always keeping the password authentication option available
- Maintaining the separation between OAuth-linked accounts and traditional accounts
- Preserving admin privileges on the original admin account

## Configuration Steps

To configure OAuth integration:

1. Navigate to the Admin Dashboard → Integrations tab
2. Click "Add New" to create a new integration
3. Select the desired provider from the dropdown
4. Enter the required credentials (Client ID, Client Secret)
5. Add any additional configuration specific to the provider
6. Enable the integration when ready

When configuring Azure AD integrations, pay special attention to the Tenant ID field:
- Use `organizations` for any organizational account
- Use a specific tenant ID to restrict to a particular organization
- Use `common` to allow any Microsoft account (not recommended for production)

## User Management

When OAuth is enabled:

- New users will be automatically created when they first sign in with the OAuth provider
- User information (name, email) will be derived from the OAuth provider
- The User Management interface will display which authentication provider is active
- Manual user registration is disabled for normal administrators
- The "Register User" button is hidden when OAuth is active

## Troubleshooting

If you encounter issues with OAuth:

1. Verify that your Client ID and Secret are correct
2. Check that the redirect URIs are configured properly in the provider's developer console
3. Ensure that your OAuth provider is online and accessible
4. If needed, temporarily disable the OAuth integration
5. Use the password login option (for admins) to regain access

## Best Practices

1. **Test Before Deployment**: Always verify OAuth login works correctly before enabling it in production
2. **Maintain Admin Credentials**: Keep secure records of admin passwords even when primarily using OAuth
3. **Monitor Account Creation**: Regularly review new accounts created through OAuth
4. **Consider IP Restrictions**: For sensitive installations, consider implementing IP-based restrictions for admin access
5. **Backup Configuration**: Maintain backups of your OAuth configuration

## Related Documentation

- [Scalytics Connect Agent Administration](./scalytics-connect-agent-administration.md)
- [External API Integrations](../developer/api-integration.md) (if available)
