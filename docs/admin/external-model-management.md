# External Model Management

This guide provides an overview of how to add, manage, and discover models from external AI providers.

## Adding a New Provider

To add a new external model provider:

1.  Navigate to the **Admin Panel**.
2.  Select **Integrations** from the sidebar.
3.  In the **API Providers** tab, click **"Add Provider"**.
4.  Fill in the required details, such as the provider's name and API URL.
5.  Click **"Save"**.

Once the provider is added, you can discover its models.

## Discovering Models

The "discover models" feature allows you to fetch a list of available models from a provider and add them to the system.

To discover models:

1.  Navigate to the **Admin Panel**.
2.  Select **Models** from the sidebar.
3.  Click the **"Discover Models"** button.
4.  Select the provider you want to discover models from.
5.  Click **"Discover"**.

The system will then fetch the models from the provider and add them to the database.

### Model Activation and Deletion

-   **Default Deactivation**: All newly discovered models are **deactivated by default**. You must manually activate them before they can be used.
-   **Preserved Status**: If you re-run the discovery process, existing models will keep their current activation status.
-   **Automatic Deletion**: Models that are no longer available from the provider will be automatically deleted from the system.

## Manual Model Management

You can also manually add, edit, and delete models from the **Models** page in the admin panel. This is useful for models that are not discoverable via the provider's API.
