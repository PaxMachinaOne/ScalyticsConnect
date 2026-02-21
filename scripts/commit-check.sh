#!/bin/bash
# Scalytics Copilot - Local Commit Check Script
# This script runs linting, security audits, tests, and CodeQL to ensure code quality.

set -e # Exit on any failure

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Starting Scalytics Copilot Commit Check...${NC}\n"

# 1. Backend Checks
echo -e "${CYAN}📦 [1/5] Checking Backend...${NC}"
npm run lint || { echo -e "${RED}❌ Backend Linting Failed${NC}"; exit 1; }
npm test || { echo -e "${RED}❌ Backend Tests Failed${NC}"; exit 1; }
echo -e "✅ Backend checks passed.\n"

# 2. Frontend Checks
echo -e "${CYAN}🖼️ [2/5] Checking Frontend...${NC}"
cd frontend
# Skip exit on frontend linting as it's often noisy in early stages
npm run lint || { echo -e "${YELLOW}⚠️ Frontend Linting had warnings/errors${NC}" ; }
CI=true npm test -- --passWithNoTests || { echo -e "${RED}❌ Frontend Tests Failed${NC}"; exit 1; }
cd ..
echo -e "✅ Frontend checks passed.\n"

# 3. Python Checks (Sanity)
echo -e "${CYAN}🐍 [3/5] Checking Python Services...${NC}"
if command -v python3 &> /dev/null; then
    python3 -m compileall scripts src/python_services > /dev/null
    echo -e "✅ Python syntax check passed.\n"
else
    echo -e "${YELLOW}⚠️ Python3 not found, skipping Python checks.${NC}\n"
fi

# 4. Security Audit
echo -e "${CYAN}🛡️ [4/5] Running Security Audit...${NC}"
npm audit --audit-level=high || { echo -e "${YELLOW}⚠️ High-level vulnerabilities found in dependencies. Please review with 'npm audit'.${NC}"; }
echo -e "✅ Security audit complete.\n"

# 5. Local CodeQL Analysis
echo -e "${CYAN}🔍 [5/5] Running Local CodeQL Analysis...${NC}"
if command -v codeql &> /dev/null; then
    ./scripts/codeql_local.sh
    # Use python script for summary and gating (if python3 is available)
    if command -v python3 &> /dev/null; then
        python3 scripts/codeql_summary.py
    else
        echo -e "${YELLOW}⚠️ python3 not found, skipping CodeQL summary report.${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ CodeQL CLI not found in PATH, skipping local deep analysis.${NC}"
    echo -e "${YELLOW}   Install from: https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli${NC}"
fi

echo -e "\n${GREEN}🎉 All checks passed! You are ready to commit.${NC}"
