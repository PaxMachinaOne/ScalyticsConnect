# Content Filtering Guide (Admin)

This guide explains how administrators can configure and manage the Content Filtering system within Scalytics Copilot to prevent the leakage of sensitive information in AI responses.

## Overview

The Content Filtering system automatically redacts or replaces potentially sensitive data (like credit card numbers, names, API keys, etc.) found in AI model responses before they are displayed to users or returned via APIs. This helps maintain compliance with regulations like PCI DSS, HIPAA, and GDPR.

Filtering is applied based on predefined **Filter Groups** (e.g., Finance, Healthcare) and specific **Filter Rules** (e.g., a regex pattern for credit cards) associated with those groups.

Crucially, filtering is integrated with the platform's permission system. By default, filters are active for all users. However, administrators can grant specific user groups permission to bypass certain filter groups, allowing those users (e.g., HR personnel needing to see names) access to the original, unfiltered information.

## How it Works

1.  **Filter Groups:** Conceptual categories for rules (e.g., Finance, Healthcare, Private, Credentials). Each group is linked to a specific bypass permission key (e.g., `filter:bypass_finance`).
2.  **Filter Rules:** Specific patterns (currently Regex or NER entity types) linked to a Filter Group. Each rule defines what to look for and an optional replacement text (defaults to `[REDACTED]` or `[ENTITY_LABEL]`).
3.  **Admin Configuration (Privacy Tab):**
    *   **Enable/Disable Filter Groups:** Admins can activate or deactivate entire filter groups globally using the toggle in the "Content Filtering" sub-tab under "Admin" > "Privacy". If a group is disabled, its rules are never applied.
    *   **Manage Rules:** Admins define and manage the specific Regex or NER rules associated with each enabled Filter Group. Rules can be individually activated or deactivated.
    *   **Manage Active Languages (NER):** Admins select which languages (English, German, French, Spanish) the NER filtering system should load models for and be capable of processing.
4.  **Admin Configuration (Groups Tab):**
    *   **Grant Exemptions:** Admins assign the relevant bypass permissions (e.g., `filter:bypass_finance`, `filter:bypass_health`) to specific User Groups using the standard group permission management interface.
5.  **Filtering Execution:**
    *   When an AI response is generated (e.g., in a chat or via the Scalytics API non-streaming endpoint):
        *   The system checks the permissions of the user requesting/receiving the response.
        *   For each **enabled** Filter Group, the system checks if the user has the corresponding bypass permission via their assigned groups.
        *   If the user **lacks** the bypass permission for an enabled group, all **active** rules within that group are applied to the response text.
        *   If the user **has** the bypass permission, the rules for that specific group are skipped.
    *   The potentially modified (filtered) response is then delivered. The original, unfiltered response is always stored in the database.

## Managing Filters

Navigate to **Admin -> Privacy -> Content Filtering**.

### Active Filter Languages (NER)

*   Use the checkboxes to select the languages (English, German, French, Spanish) for which the system should load NER models and perform filtering.
*   Click "Save Language Settings" to apply changes. The backend worker will load the necessary models based on this setting.

### Filter Groups

This table lists the predefined conceptual filter groups:

*   **Name:** The category of filtering (e.g., Finance).
*   **Description:** Explains the purpose of the group.
*   **Filtering Enabled:** Use the toggle (checkbox) to activate or deactivate all rules within this group globally. If disabled, no rules from this group will be applied, regardless of user permissions.
*   **Exemption Permission:** Shows the permission key (e.g., `filter:bypass_finance`) that needs to be assigned to a User Group to allow users in that group to see unfiltered data for this category. Assign these permissions in the **Admin -> Groups** section.
*   **Actions:**
    *   **View Rules:** Click this button to view and manage the specific filter rules associated with this group (see below).

*(Note: Filter Groups themselves are predefined based on the permissions and cannot be created or deleted via the UI).*

### Filter Rules

After clicking "View Rules" for a specific Filter Group, a section appears to manage its rules:

*   **New Rule:** Click "+ New Rule" to open a modal form.
    *   **Rule Type:** Select 'Regex' or an NER type (e.g., 'ner_PERSON').
    *   **Pattern / Entity:**
        *   For 'Regex', enter the full JavaScript-compatible regular expression pattern.
        *   For 'ner_*', enter the entity type to detect (e.g., `PERSON`, `ORG`, `GPE`, `DATE`).
    *   **Replacement (Optional):** Text to replace matched patterns with. Defaults to `[REDACTED]` for regex or `[ENTITY_LABEL]` (e.g., `[PERSON]`) for NER if left blank.
    *   **Description (Optional):** Explain what the rule does.
    *   **Rule Active:** Check this box to enable the rule.
    *   Click "Create Rule" to save.
*   **Rule List:** Displays existing rules for the selected group.
    *   **Edit:** Opens the modal form to modify an existing rule.
    *   **Delete:** Permanently removes the rule (requires confirmation).
    *   *(TODO: Add toggle for is_active status directly in the table)*.

## Important Considerations

*   **Regex Complexity:** Craft regex patterns carefully to avoid performance issues and minimize false positives/negatives. Test them thoroughly.
*   **NER Accuracy:** NER models are not perfect and may miss some entities or misclassify others. The `en_core_web_sm` model provides a good balance but may not catch all variations. More specific or larger models could be integrated if needed (requires backend changes).
*   **Language Detection:** The system uses automatic language detection (`franc`) to apply the correct NER model. Accuracy can vary, especially on short or mixed-language text.
*   **Streaming API:** Currently, filtering is **not applied** to streaming responses from the Scalytics API (`/v1/chat/completions` with `stream: true`) due to technical limitations. Non-streaming API responses and standard chat UI responses are filtered.
*   **Performance:** Complex regex or a large number of active rules can impact response latency. Monitor performance if extensive filtering is configured.
