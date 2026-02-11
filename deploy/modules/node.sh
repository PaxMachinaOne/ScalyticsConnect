#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# System Node.js verification and management
# This module verifies the system Node.js installation

# Source utils and env modules if not already sourced
if ! command_exists log; then
  MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
  source "$MODULE_DIR/utils.sh"
  source "$MODULE_DIR/env.sh"
fi

# Verify system Node.js installation
verify_node() {
  local required_version="${1:-16.0.0}"
  
  log "Verifying system Node.js installation (minimum required: v$required_version)..."
  
  # Check if Node.js is installed
  if ! command_exists node; then
    log_error "Node.js not found. Please install Node.js v$required_version or higher system-wide."
    return 1
  fi
  
  # Get Node.js version
  local current_version
  current_version=$(node -v | sed 's/^v//')
  log "Found Node.js v$current_version"
  
  # Simple version comparison
  if [[ "$(printf '%s\n' "$required_version" "$current_version" | sort -V | head -n1)" != "$required_version" ]]; then
    log_warning "Node.js v$current_version is older than required v$required_version"
    log_warning "Some features may not work correctly with this version."
    # Continue anyway - it's just a warning
  else
    log_success "Node.js v$current_version meets version requirement (v$required_version)"
  fi
  
  # Check for npm
  if ! command_exists npm; then
    log_error "npm not found. Please ensure npm is installed with Node.js."
    return 1
  fi
  
  # Get npm version
  local npm_version
  npm_version=$(npm -v)
  log "Found npm v$npm_version"
  
  # Save version to environment if not already set
  if [ -z "$NODE_VERSION" ]; then
    NODE_VERSION="$current_version"
    set_env_var "NODE_VERSION" "$NODE_VERSION"
    log "Set NODE_VERSION to $NODE_VERSION"
  fi
  
  log_success "System Node.js verified successfully"
  return 0
}

# Install global npm packages using system Node.js
install_global_package() {
  local package_name="$1"
  
  if [ -z "$package_name" ]; then
    log_error "No package name specified for global installation"
    return 1
  fi
  
  log "Installing global npm package: $package_name"
  
  # Check if Node.js is available
  if ! command_exists node; then
    log_error "Node.js not found. Cannot install global packages."
    return 1
  fi
  
  # Install the package globally
  if ! npm install -g "$package_name"; then
    log_error "Failed to install $package_name globally"
    return 1
  fi
  
  log_success "$package_name installed globally"
  return 0
}

# Only run when script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  show_header
  setup_environment
  verify_node "$@"
fi
