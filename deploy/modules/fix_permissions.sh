#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Script to fix permissions for all module scripts in a deployment
# Useful for fixing permissions without redeploying

# Get the module directory
MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PARENT_DIR="$( cd "$MODULE_DIR/.." &> /dev/null && pwd )"

# Source utility functions if available
if [ -f "$MODULE_DIR/utils.sh" ]; then
  source "$MODULE_DIR/utils.sh"
else
  # Define minimal logging functions if utils.sh is not available
  log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
  log_error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $*"; }
  log_warning() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️ $*"; }
  log_success() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $*"; }
  run_with_sudo() { sudo "$@"; }
  run_as_user() { sudo -u "$1" "${@:2}"; }
fi

# Function to fix application core directory permissions
fix_app_core_permissions() {
  log "Fixing core application directory permissions..."
  
  # Get directory paths
  local app_root_dir="${APP_ROOT:-/var/www/connect}"
  local data_dir="$app_root_dir/data"
  local app_user="${APP_USER:-sconnect}"
  local app_group="${APP_GRP:-www-data}"
  
  log "Setting permissions for application root: $app_root_dir"
  
  # Ensure directories exist
  run_with_sudo mkdir -p "$data_dir"
  
  # Set ownership recursively for the entire application directory
  run_with_sudo chown -R "$app_user:$app_group" "$app_root_dir"
  
  # Set directory permissions to allow group access (750 = rwxr-x---)
  # This ensures www-data group has access through the entire path
  run_with_sudo chmod 750 "$app_root_dir"
  
  # Set data directory to be group writable (770 = rwxrwx---)
  # This allows both the app user and web server to write to data
  run_with_sudo chmod 770 "$data_dir"
  
  # Set SGID bit on data directory to maintain group ownership
  run_with_sudo chmod g+s "$data_dir"
  
  log_success "Core application permissions fixed"
  return 0
}

# Function to fix all script permissions
fix_script_permissions() {
  local target_dir="$1"
  local user="${2:-$(whoami)}"
  local group="${3:-$(id -gn $user)}"
  
  log "Fixing permissions for shell scripts in $target_dir"
  
  if [ ! -d "$target_dir" ]; then
    log_error "Target directory does not exist: $target_dir"
    return 1
  fi
  
  # Count scripts before fixing
  local script_count=$(find "$target_dir" -type f -name "*.sh" | wc -l)
  log "Found $script_count shell scripts to fix"
  
  # Set executable permissions on all shell scripts
  run_with_sudo find "$target_dir" -type f -name "*.sh" -exec chmod +x {} \;
  
  # Set proper ownership for good measure
  run_with_sudo chown -R "$user:$group" "$target_dir"
  
  log_success "Permissions fixed for shell scripts in $target_dir"
  return 0
}

# Main script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # Check if running as root or with sudo
  if [ "$(id -u)" != "0" ]; then
    log_error "This script must be run as root or with sudo"
    exit 1
  fi
  
  # Source env.sh to get environment variables if available
  if [ -f "$MODULE_DIR/env.sh" ]; then
    source "$MODULE_DIR/env.sh"
    setup_environment 2>/dev/null || log_warning "Failed to set up environment, using default paths"
  fi
  
  # Default paths
  APP_DIR="${APP_DIR:-/var/opt/sconnect/MCPServer/Connect}"
  APP_USER="${APP_USER:-sconnect}"
  APP_GROUP="${APP_GROUP:-sconnect}"
  
  # Fix permissions for the app directory
  fix_script_permissions "$APP_DIR" "$APP_USER" "$APP_GROUP"
  
  log "Script permissions have been fixed."
  log "If you're still seeing permission issues, please verify the service user has read access to all required files."
fi
