# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

# Simple script to verify huggingface_hub installation
try:
    print(f"✅ huggingface_hub is installed")
except ImportError:
    print(f"❌ huggingface_hub is not installed")
    print(f"To install: pip install huggingface_hub")
