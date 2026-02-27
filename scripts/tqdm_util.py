# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

# Simple script to verify tqdm installation
try:
    print(f"✅ tqdm is installed")
except ImportError:
    print(f"❌ tqdm is not installed")
    print(f"To install: pip install tqdm")
