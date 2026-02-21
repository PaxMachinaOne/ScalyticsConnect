#!/usr/bin/env bash
# Scalytics Copilot - Local CodeQL Build Script for Python
set -euo pipefail

echo "Preparing Python build for CodeQL..."
# Python usually doesn't need a formal build step for CodeQL (build-mode=none),
# but we can verify dependencies here if needed.
pip install -r scripts/requirements.txt || echo "Optional requirements installation failed, continuing..."
echo "Python build preparation complete."
