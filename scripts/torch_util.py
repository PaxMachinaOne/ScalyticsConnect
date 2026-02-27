# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

# Simple script to verify torch installation
try:
    print(f"✅ torch is installed")
except ImportError:
    print(f"❌ torch is not installed")
    print(f"To install: pip install torch")
