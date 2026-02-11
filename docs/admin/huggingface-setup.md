# Hugging Face Hub Integration Setup

This guide explains how to set up the integration with Hugging Face Hub, which is necessary for downloading and managing models, especially those that are "gated" and require user authentication.

## Obtaining a Hugging Face API Token

To download gated models (like those from Meta or Google), you must first accept their license terms on the model's page on Hugging Face Hub and then authenticate with an API token.

### Step 1: Create a Hugging Face Account

If you don't already have one, create an account on [huggingface.co](https://huggingface.co/join).

### Step 2: Find and Accept the Model's License

1.  Navigate to the page of the gated model you wish to download (e.g., `meta-llama/Llama-3.2-1B-Instruct`).
2.  You will see a section requiring you to accept the license terms. Read them and, if you agree, accept them. You must do this for each gated model you intend to use.

### Step 3: Generate an Access Token

1.  Log in to your Hugging Face account.
2.  Go to your **Settings** page by clicking on your profile picture in the top-right corner.
3.  In the left sidebar, navigate to **Access Tokens**.
4.  Click the **"New token"** button.
5.  Give your token a descriptive name (e.g., "Scalytics Connect Access").
6.  Assign it the **`read`** role. The `write` role is not necessary for downloading models.
7.  **Important**: In the token's **fine-grained permissions**, ensure the following are enabled:
    - ✅ **"Read access to public gated repositories"** - Required for downloading gated models
    - ✅ **"Read repositories"** - Required for accessing model metadata and files
    - ✅ **"Access public gated repositories"** - Essential for license-protected models
8.  Click **"Generate a token"**.

**Token Permissions Summary:**
- **Role**: `read` (not `write`)
- **Required Permissions**: 
  - Read access to public gated repositories
  - Read repositories 
  - Access public gated repositories

These permissions allow the system to:
- Download model files from both public and gated repositories
- Access model metadata including license information
- Fetch model cards and configuration files

### Step 4: Use the Token in the Application

1.  Copy the generated token immediately. For security reasons, you will not be able to see it again.
2.  In the Scalytics Connect admin panel, go to the **Admin -> Models -> Hugging Face** page.
3.  You will see a **"Hugging Face Hub Login"** section.
4.  Paste your copied token into the input field and click **"Login"**.

Your system is now authenticated and can download gated models for which you have accepted the license terms.
