#!/usr/bin/env bash
# Scalytics Copilot - Local CodeQL Execution Script
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v codeql >/dev/null 2>&1; then
  echo "ERROR: codeql CLI not found in PATH"
  echo "Install from: https://docs.github.com/en/code-security/codeql-cli/getting-started-with-the-codeql-cli"
  exit 1
fi

mkdir -p .tmp/codeql

echo "==> Ensuring CodeQL standard query packs are available"
codeql pack download codeql/javascript-queries codeql/python-queries codeql/actions-queries

# Stable defaults for local runs (Increased to 4GB to avoid OOM)
CODEQL_JS_RAM_MB="${CODEQL_JS_RAM_MB:-4096}"
CODEQL_JS_THREADS="${CODEQL_JS_THREADS:-2}"
CODEQL_PY_RAM_MB="${CODEQL_PY_RAM_MB:-4096}"
CODEQL_ACTIONS_RAM_MB="${CODEQL_ACTIONS_RAM_MB:-1024}"

# Strategy github/security-and-quality (Set to security-and-quality for deeper local analysis)
CODEQL_QUERY_STRATEGY="${CODEQL_QUERY_STRATEGY:-security-and-quality}"

run_js() {
  echo "==> CodeQL (JavaScript/TypeScript)"
  echo "    using --ram=${CODEQL_JS_RAM_MB}MB --threads=${CODEQL_JS_THREADS}"
  rm -rf .tmp/codeql/js-db
  chmod +x scripts/codeql_js_build.sh
  codeql database create .tmp/codeql/js-db \
    --language=javascript \
    --ram="$CODEQL_JS_RAM_MB" \
    --command="./scripts/codeql_js_build.sh"

  if [[ "$CODEQL_QUERY_STRATEGY" == "security-and-quality" ]]; then
    codeql database analyze .tmp/codeql/js-db \
      codeql/javascript-queries:codeql-suites/javascript-security-and-quality.qls \
      --download \
      --ram="$CODEQL_JS_RAM_MB" \
      --threads="$CODEQL_JS_THREADS" \
      --format=sarifv2.1.0 \
      --sarif-category="/language:javascript" \
      --output .tmp/codeql/javascript.sarif
  else
    codeql database analyze .tmp/codeql/js-db \
      codeql/javascript-queries \
      --download \
      --ram="$CODEQL_JS_RAM_MB" \
      --threads="$CODEQL_JS_THREADS" \
      --format=sarifv2.1.0 \
      --sarif-category="/language:javascript" \
      --output .tmp/codeql/javascript.sarif
  fi
}

run_py() {
  echo "==> CodeQL (Python)"
  echo "    using --ram=${CODEQL_PY_RAM_MB}MB"
  rm -rf .tmp/codeql/py-db
  chmod +x scripts/codeql_py_build.sh
  codeql database create .tmp/codeql/py-db \
    --language=python \
    --ram="$CODEQL_PY_RAM_MB" \
    --command="./scripts/codeql_py_build.sh"

  if [[ "$CODEQL_QUERY_STRATEGY" == "security-and-quality" ]]; then
    codeql database analyze .tmp/codeql/py-db \
      codeql/python-queries:codeql-suites/python-security-and-quality.qls \
      --download \
      --ram="$CODEQL_PY_RAM_MB" \
      --format=sarifv2.1.0 \
      --sarif-category="/language:python" \
      --output .tmp/codeql/python.sarif
  else
    codeql database analyze .tmp/codeql/py-db \
      codeql/python-queries \
      --download \
      --ram="$CODEQL_PY_RAM_MB" \
      --format=sarifv2.1.0 \
      --sarif-category="/language:python" \
      --output .tmp/codeql/python.sarif
  fi
}

run_actions() {
  echo "==> CodeQL (Actions)"
  echo "    using --ram=${CODEQL_ACTIONS_RAM_MB}MB"
  rm -rf .tmp/codeql/actions-db
  codeql database create .tmp/codeql/actions-db \
    --language=actions \
    --build-mode=none \
    --ram="$CODEQL_ACTIONS_RAM_MB"

  codeql database analyze .tmp/codeql/actions-db \
    codeql/actions-queries \
    --download \
    --ram="$CODEQL_ACTIONS_RAM_MB" \
    --format=sarifv2.1.0 \
    --sarif-category="/language:actions" \
    --output .tmp/codeql/actions.sarif
}

# Run for all project languages
run_js
run_py
run_actions

echo ""
echo "CodeQL local run complete."
echo "SARIF outputs:"
echo "  .tmp/codeql/javascript.sarif"
echo "  .tmp/codeql/python.sarif"
echo "  .tmp/codeql/actions.sarif"
