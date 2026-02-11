#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Direct Node.js execution with system Node.js
# This script uses the system Node.js installation

# Source utils and env modules if not already sourced
MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if ! command -v log &>/dev/null; then
  source "$MODULE_DIR/utils.sh"
  source "$MODULE_DIR/env.sh"
fi

# Also check SCRIPT_DIR if it's defined from parent script but use MODULE_DIR to avoid nesting
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/modules/env.sh" ] && [ "$SCRIPT_DIR" != "$MODULE_DIR" ]; then
  # We use the full path from the parent script to avoid module path duplication
  source "$SCRIPT_DIR/modules/env.sh"
fi

# Ensure we have environment variables defined
setup_environment 2>/dev/null || true

# Log function fallbacks if they're not available
if ! command -v log >/dev/null 2>&1; then
  log() { echo "[INFO] $*"; }
  log_warning() { echo "[WARNING] $*"; }
  log_error() { echo "[ERROR] $*"; }
  log_success() { echo "[SUCCESS] $*"; }
fi

# Verify system Node.js is installed and available
verify_system_node() {
  local required_version="${1:-16.0.0}"
  
  log "Verifying system Node.js (min required: v$required_version)..."
  
  # Check if node exists
  if ! command -v node >/dev/null 2>&1; then
    log_error "System Node.js not found. Please install Node.js v$required_version+ system-wide."
    return 1
  fi
  
  # Get node version 
  local node_version
  node_version=$(node -v 2>/dev/null | sed 's/^v//')
  
  if [ -z "$node_version" ]; then
    log_error "Could not determine Node.js version"
    return 1
  fi
  
  log_success "Using system Node.js v$node_version"
  return 0
}

# Run a node command
run_node_command() {
  # Verify node is available
  verify_system_node || {
    log_error "Failed to verify system Node.js"
    return 1
  }
  
  # Execute the command
  local cmd="$*"
  log "Executing command: $cmd"
  eval "$cmd"
  return $?
}

# Validate npm directory - checks if package.json exists when running npm commands
validate_npm_directory() {
  if [[ "$1" == *"npm"* ]] && [ ! -f "package.json" ]; then
    local current_dir="$(pwd)"
    
    # If we're in APP_HOME instead of APP_DIR, this is likely the error
    if [[ "$current_dir" == "$APP_HOME"* ]] && [ -n "$APP_DIR" ] && [ -d "$APP_DIR" ]; then
      log_warning "Directory mismatch detected! Currently in: $current_dir"
      log_warning "This appears to be the app user's home directory, not the app installation directory"
      
      # Check if APP_DIR has a package.json
      if [ -f "$APP_DIR/package.json" ]; then
        log_warning "Auto-redirecting to application directory: $APP_DIR"
        cd "$APP_DIR"
        log_success "Now in correct application directory with package.json"
        return 0
      fi
    fi
    
    log_error "No package.json found in current directory: $current_dir"
    log_error "Please run npm commands in a valid Node.js project directory"
    return 1
  fi
  return 0
}

# Direct execution mode
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # If executed directly with arguments, run those as a command
  if [ $# -gt 0 ]; then
    verify_system_node
    
    # Check if an app directory is specified as the last argument with --app-dir=
    specified_app_dir=""
    for arg in "$@"; do
      if [[ "$arg" == "--app-dir="* ]]; then
        specified_app_dir="${arg#*=}"
        break
      fi
    done
    
    # Check if we need to load environment from file if not done already
    if [ -z "$APP_DIR" ]; then
      # Try to find .connect-env in parent directories
      if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/.connect-env" ]; then
        log_warning "APP_DIR not defined, loading from $SCRIPT_DIR/.connect-env file"
        source "$SCRIPT_DIR/.connect-env"
      elif [ -n "$MODULE_DIR" ] && [ -f "$MODULE_DIR/../.connect-env" ]; then
        log_warning "APP_DIR not defined, loading from $MODULE_DIR/../.connect-env file"
        source "$MODULE_DIR/../.connect-env"
      fi
    fi
    
    # If app directory is explicitly specified, change to it
    if [ -n "$specified_app_dir" ]; then
      if [ -d "$specified_app_dir" ]; then
        cd "$specified_app_dir"
        log "Changed working directory to: $specified_app_dir"
      else
        log_error "Specified app directory does not exist: $specified_app_dir"
        exit 1
      fi
    fi
    
    # Preserve the current working directory
    CURRENT_DIR=$(pwd)
    log "Running node command in current directory: $CURRENT_DIR"
    
    # Validate directory for npm commands
    if [[ "$1" == *"npm"* ]]; then
      validate_npm_directory "$@" || exit 1
    fi
    
    # Filter out our --app-dir argument if present
    ARGS=()
    for arg in "$@"; do
      if [[ "$arg" != "--app-dir="* ]]; then
        ARGS+=("$arg")
      fi
    done
    
    # Execute the command
    "${ARGS[@]}"
  else
    # Otherwise print version information
    verify_system_node && {
      echo "System Node.js version: $(node -v)"
      echo "npm version: $(npm -v 2>/dev/null || echo 'not found')"
    }
  fi
fi
