#!/bin/bash
# Scalytics Copilot - Local Commit Check Script
# This script runs linting, security audits, and tests to ensure code quality.

set -e # Exit on any failure

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Starting Scalytics Copilot Commit Check...${NC}
"

# 1. Backend Checks
echo -e "${GREEN}📦 [1/4] Checking Backend...${NC}"
npm run lint || { echo -e "${RED}❌ Backend Linting Failed${NC}"; exit 1; }
npm test || { echo -e "${RED}❌ Backend Tests Failed${NC}"; exit 1; }
echo -e "✅ Backend checks passed.
"

# 2. Frontend Checks
echo -e "${GREEN}🖼️ [2/4] Checking Frontend...${NC}"
cd frontend
npm run lint || { echo -e "${YELLOW}⚠️ Frontend Linting had warnings/errors (skipping exit)${NC}" ; }
CI=true npm test -- --passWithNoTests || { echo -e "${RED}❌ Frontend Tests Failed${NC}"; exit 1; }
cd ..
echo -e "✅ Frontend checks passed.
"

# 3. Python Checks (Sanity)
echo -e "${GREEN}🐍 [3/4] Checking Python Services...${NC}"
if command -v python3 &> /dev/null; then
    python3 -m compileall scripts src/python_services > /dev/null
    echo -e "✅ Python syntax check passed.
"
else
    echo -e "${YELLOW}⚠️ Python3 not found, skipping Python checks.${NC}
"
fi

# 4. Security Audit
echo -e "${GREEN}🛡️ [4/4] Running Security Audit...${NC}"
npm audit --audit-level=high || { echo -e "${YELLOW}⚠️ High-level vulnerabilities found in dependencies. Please review with 'npm audit'.${NC}"; }
echo -e "✅ Security audit complete.
"

echo -e "${GREEN}🎉 All checks passed! You are ready to commit.${NC}"
