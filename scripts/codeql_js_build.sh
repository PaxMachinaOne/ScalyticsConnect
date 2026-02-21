#!/usr/bin/env bash
# Scalytics Copilot - Local CodeQL Build Script for JS/TS
set -euo pipefail

# In a real build, we might run npm install or similar.
# For CodeQL database creation, we just need to ensure the environment is sane.
echo "Preparing JS/TS build for CodeQL..."
npm install --no-package-lock --no-save
cd frontend && npm install --no-package-lock --no-save && cd ..
echo "JS/TS build preparation complete."
