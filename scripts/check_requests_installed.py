# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)

# Simple script to verify requests installation
# Renamed from requests.py to check_requests_installed.py to avoid import conflicts.
try:
    print(f"✅ requests is installed")
except ImportError:
    print(f"❌ requests is not installed")
    print(f"To install: pip install requests")
