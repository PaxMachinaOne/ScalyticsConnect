# Permission System Guide

This guide explains how the permission system works in the Connect platform, what each permission means, and how to assign permissions to users and groups.

## Overview

The Connect platform uses a role-based permission system that allows administrators to control access to various features and functionalities. Permissions can be assigned directly to individual users or to groups, making it easy to manage access for multiple users with similar roles.

## Permission Types

Permissions in the system follow two syntax formats:
- Core permissions: Use underscore format (e.g., `access_admin`)
- Feature-specific permissions: Use colon format (e.g., `users:manage`)

## Standard Permissions

Below is a detailed explanation of each permission and what it enables for users or groups:

### Core Permissions

| Permission | Description | What It Enables |
|------------|-------------|-----------------|
| `access_admin` | Access to administrative functions | Basic access to the admin interface and dashboard |
| `use_all_models` | Use any model regardless of group permissions | Bypass the normal model access restrictions |
| `manage_integrations` | Manage authentication and service integrations | Add, edit, and remove integrations with external services |
| `view_integrations` | View integration configurations | View integration settings but not modify them |

### Feature-specific Permissions

| Permission | Description | What It Enables |
|------------|-------------|-----------------|
| `stats:view` | View system statistics and logs | Access to usage statistics, activity logs, and system metrics |
| `hardware:view` | View hardware information | Access to hardware monitoring, CPU/GPU usage, and system resources |
| `users:manage` | Create, edit, and delete user accounts | Full user management including creation, editing, and deletion |
| `providers:manage` | Manage API providers | Add, edit, and configure external API providers |
| `api-keys:manage` | Manage API keys for external services | Create, edit, and revoke API keys |
| `huggingface:access` | Access Hugging Face models | Search, download, and manage Hugging Face models |
| `models:manage` | Add, edit, and configure AI models | Full model management including uploading, configuring, and deletion |
| `model-access:manage` | Control which users can access models | Assign model access permissions to users and groups |
| `groups:manage` | Create, edit, and manage user groups | Full group management including creation and assigning users |
| `can_use_mcp_tools` | Access and use AI Agents and MCP Tools | Allows users to view and interact with available AI Agents and configured MCP tools. |

## Permission Assignment

### Direct User Permissions

Administrators can assign permissions directly to individual users. This is useful for:
- Granting special permissions to specific users
- Testing permissions before applying to larger groups
- One-off exceptions to the normal group permission structure

To assign a permission to a user:
1. Navigate to Admin → Users
2. Select the user
3. Go to the Permissions tab
4. Click "Grant" next to the desired permission

### Group Permissions

The recommended way to manage permissions is through groups, as this provides a more scalable and manageable approach:
1. Create groups that represent different roles in your organization
2. Assign permissions to these groups
3. Add users to the appropriate groups

Any user who is a member of a group automatically inherits all permissions granted to that group.

To assign a permission to a group:
1. Navigate to Admin → Groups
2. Select the group
3. Go to the Permissions tab
4. Click "Grant" next to the desired permission

## Common Permission Sets

### Administrator Group

Administrators typically have all permissions:
- `access_admin`
- `users:manage`
- `groups:manage`
- `models:manage`
- `use_all_models`
- `manage_integrations`
- `view_integrations`
- `stats:view`
- `hardware:view`
- `providers:manage`
- `api-keys:manage`
- `huggingface:access`
- `model-access:manage`

### Power User Group

Power users typically have:
- `access_admin`
- `stats:view`
- `hardware:view`
- `huggingface:access`
- `models:manage` (possibly with certain restrictions)
- `view_integrations`

### Model Manager Group

For users who only manage models:
- `access_admin`
- `models:manage`
- `huggingface:access`
- `model-access:manage`

## Permission Troubleshooting

If users report they cannot access certain features:

1. Check if they have the required direct permissions
2. Check if they are in a group with the required permissions
3. Verify that the group has the correct permissions assigned
4. Check if there are any conflicting permissions
5. Ensure the user has `access_admin` permission as a prerequisite

## Technical Implementation

Permissions are stored in the `admin_permissions` table. User and group assignments are stored in the `user_admin_permissions` and `group_admin_permissions` tables, respectively.

If you experience any issues with duplicate permissions or missing access, you can run the permission fix script:

```
node scripts/run_permission_fix.js
```

This script will standardize the permission format and ensure all assignments are correctly mapped.

## Best Practices

1. **Use Groups**: Assign permissions to groups rather than individual users
2. **Minimum Privileges**: Grant only the permissions necessary for users to perform their tasks
3. **Regular Audits**: Periodically review group memberships and permission assignments
4. **Document Roles**: Maintain documentation of which permissions each role in your organization should have
5. **Test Changes**: When changing permissions, verify access works as expected

## Reference

For more information on implementing and managing permissions, see the API documentation or contact support.
