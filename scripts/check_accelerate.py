# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

# Simple script to verify accelerate installation
try:
    import accelerate
    print(f"✅ accelerate is installed")
except ImportError:
    print(f"❌ accelerate is not installed")
    print(f"To install: pip install accelerate")
