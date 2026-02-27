# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

# Simple script to verify transformers installation
try:
    print(f"✅ transformers is installed")
except ImportError:
    print(f"❌ transformers is not installed")
    print(f"To install: pip install transformers")
