#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Utility functions for deployment system

# Colors for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Function to check if a command exists
command_exists() {
  command -v "$1" &> /dev/null
}

# Function to check if we're already in a sudo context
is_sudo_context() {
  if [ -n "$SUDO_USER" ]; then
    return 0 
  else
    return 1
  fi
}

# Function to safely run a command with sudo if needed
run_with_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

# Function to run a command as a specific user
run_as_user() {
  local user="$1"
  shift
  
  if [ "$(id -un)" = "$user" ]; then
    "$@"
  elif [ "$(id -u)" -eq 0 ]; then
    # Running as root, use su. Construct the command string carefully.
    local script_path="$1"
    shift 
    local args_string=""
    local arg
    for arg in "$@"; do
      # Quote each argument for the target shell
      printf -v quoted_arg '%q' "$arg"
      args_string+=" $quoted_arg"
    done
    # Construct the full command to be executed by su -c
    local full_command="$script_path$args_string"
    su "$user" -s /bin/bash -c "$full_command"
  else
    sudo -u "$user" "$@"
  fi
}

# Function to display a header
show_header() {
  clear
  echo -e "${BLUE}=================================================${NC}"
  echo -e "${BLUE}  Connect Deployment System${NC}"
  echo -e "${BLUE}=================================================${NC}"
  echo ""
}

# Function to safely write to log file
_write_to_log() {
  # Log message is passed as $1

  # Only attempt file logging if APP_DIR is set
  if [ -n "$APP_DIR" ]; then
      local log_dir="$APP_DIR/logs"
      local log_file="$log_dir/connect-deploy-log-$(date +%Y-%m-%d).txt"

      # Ensure the directory exists with correct permissions
      # Use sudo initially as the main script runs with sudo
      if [ ! -d "$log_dir" ]; then
          run_with_sudo mkdir -p "$log_dir"
          # Set ownership to app_user:app_group (e.g., sconnect:www-data)
          # Ensure APP_USER and APP_GRP are available, fallback if not
          local log_owner="${APP_USER:-root}"
          local log_group="${APP_GRP:-root}" # Or perhaps 'nogroup' or 'nobody' as fallback? Using root for now.
          run_with_sudo chown "$log_owner:$log_group" "$log_dir"
          run_with_sudo chmod 2775 "$log_dir"
      fi

      # Append the message to the log file
      # Use >> to append and check write permission implicitly
      echo "$1" >> "$log_file"
      # If write failed, log to stderr as fallback
      if [ $? -ne 0 ]; then
          echo "Fallback log (cannot write to $log_file): $1" >&2
      fi
  else
      echo "Early log (APP_DIR not set): $1" >&2
  fi
}

# Function to log messages
log() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local message="[${timestamp}] $1"
  
  # Display to console
  echo -e "${CYAN}${message}${NC}"
  
  # Write to log file
  _write_to_log "$message"
}

# Function to log success messages
log_success() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local message="[${timestamp}] ✅ $1"
  
  # Display to console
  echo -e "${GREEN}${message}${NC}"
  
  # Write to log file
  _write_to_log "$message"
}

# Function to log warnings
log_warning() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local message="[${timestamp}] ⚠️ $1"
  
  # Display to console
  echo -e "${YELLOW}${message}${NC}"
  
  # Write to log file
  _write_to_log "$message"
}

# Function to log errors
log_error() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local message="[${timestamp}] ❌ $1"
  
  # Display to console
  echo -e "${RED}${message}${NC}"
  
  # Write to log file
  _write_to_log "$message"
}

# Function to create a directory if it doesn't exist
ensure_dir() {
  if [ ! -d "$1" ]; then
    log "Creating directory: $1"
    mkdir -p "$1"
  fi
}

# Function to create a symbolic link
create_symlink() {
  local source="$1"
  local target="$2"
  
  if [ -L "$target" ]; then
    log "Updating symlink: $target -> $source"
    rm "$target"
  elif [ -e "$target" ]; then
    log "Backing up existing file before creating symlink: $target"
    mv "$target" "${target}.bak-$(date +%Y%m%d%H%M%S)"
  else
    log "Creating symlink: $target -> $source"
  fi
  
  ln -sf "$source" "$target"
}

# Function to add a directory to PATH in environment file
add_to_path() {
  local dir="$1"
  local env_file="${2:-$HOME/.bashrc}"
  
  if ! grep -q "export PATH=.*$dir" "$env_file"; then
    log "Adding $dir to PATH in $env_file"
    echo -e "\n# Added by Connect deployment" >> "$env_file"
    echo "export PATH=\"$dir:\$PATH\"" >> "$env_file"
  fi
}

# Function to set an environment variable in .env file
set_env_var() {
  local var_name="$1"
  local var_value="$2"
  local env_file="${3:-$DEPLOY_DIR/.connect-env}"
  
  # Create the file if it doesn't exist
  ensure_dir "$(dirname "$env_file")"
  touch "$env_file"
  
  # Check if variable already exists and update it, or add it
  if grep -q "^$var_name=" "$env_file"; then
    # Use sed to replace the line, compatible with both GNU and BSD sed
    if [[ "$(uname)" == "Darwin" ]]; then
      # macOS requires an empty string for the -i flag
      sed -i '' "s|^$var_name=.*|$var_name=\"$var_value\"|g" "$env_file"
    else
      # Linux version
      sed -i "s|^$var_name=.*|$var_name=\"$var_value\"|g" "$env_file"
    fi
  else
    # Append the variable to the file
    echo "$var_name=\"$var_value\"" >> "$env_file"
  fi
}

# Function to prompt for user confirmation
confirm() {
  local message="${1:-Are you sure you want to continue?}"
  local default="${2:-y}"
  
  local prompt
  if [ "$default" = "y" ]; then
    prompt="[Y/n]"
  else
    prompt="[y/N]"
  fi
  
  read -p "$message $prompt " response
  response=${response,,} # Convert to lowercase
  
  if [ -z "$response" ]; then
    response=$default
  fi
  
  if [[ "$response" =~ ^(yes|y)$ ]]; then
    return 0
  else
    return 1
  fi
}

# Function to check if database schema has changed and backup if needed
backup_database_if_needed() {
  local db_path="${1:-./data/mcp.db}"
  local backup_dir="${2:-./data/backups}"
  
  # Check if database file exists
  if [ ! -f "$db_path" ]; then
    log_warning "Database file not found: $db_path, skipping backup"
    return 0
  fi
  
  # Create backup directory if it doesn't exist
  ensure_dir "$backup_dir"
  
  # Create a temp file for current schema
  local current_schema_file=$(mktemp)
  local last_schema_file="$backup_dir/last_schema.txt"
  
  # Dump current schema
  log "Checking database schema for changes..."
  sqlite3 "$db_path" ".schema" > "$current_schema_file"
  
  # Check if previous schema dump exists
  if [ ! -f "$last_schema_file" ]; then
    log "No previous schema found, creating initial schema snapshot"
    cp "$current_schema_file" "$last_schema_file"
    # Always backup on first run
    backup_database "$db_path" "$backup_dir"
    return 0
  fi
  
  # Compare schemas
  if ! diff -q "$current_schema_file" "$last_schema_file" &>/dev/null; then
    log_warning "Database schema has changed, creating backup"
    # Save new schema
    cp "$current_schema_file" "$last_schema_file"
    # Backup database
    backup_database "$db_path" "$backup_dir"
  else
    log "Database schema unchanged, skipping backup"
  fi
  
  # Cleanup temp file
  rm -f "$current_schema_file"
  
  return 0
}

# Function to create a database backup
backup_database() {
  local db_path="$1"
  local backup_dir="$2"
  local timestamp=$(date +%Y-%m-%dT%H-%M-%S-%3NZ)
  local backup_file="$backup_dir/mcp-db-backup-$timestamp.db"
  
  log "Creating database backup: $backup_file"
  
  # Make sure we have sqlite3 command
  if ! command_exists sqlite3; then
    log_error "sqlite3 command not found, cannot create backup"
    return 1
  fi
  
  # Check if database file exists
  if [ ! -f "$db_path" ]; then
    log_error "Database file not found: $db_path"
    return 1
  fi
  
  # Create a backup using sqlite3 .backup command (this is atomic and safe)
  sqlite3 "$db_path" ".backup '$backup_file'"
  
  if [ $? -eq 0 ] && [ -f "$backup_file" ]; then
    log_success "Database backup created successfully"
    
    # Keep only the 5 most recent backups to save space
    local old_backups=( $(ls -t "$backup_dir"/mcp-db-backup-*.db 2>/dev/null | tail -n +6) )
    if [ ${#old_backups[@]} -gt 0 ]; then
      log "Removing old backups to save space"
      for old_backup in "${old_backups[@]}"; do
        log "Removing old backup: $old_backup"
        rm -f "$old_backup"
      done
    fi
    
    return 0
  else
    log_error "Failed to create database backup"
    return 1
  fi
}

# Setup CUDA environment if available
setup_cuda_environment() {
  # Check for CUDA 12.1 specifically (our target version)
  if [ -d "/usr/local/cuda-12.1" ]; then
    log "Found CUDA 12.1 installation, setting up environment..."
    export CUDA_HOME="/usr/local/cuda-12.1"
    export PATH="/usr/local/cuda-12.1/bin:$PATH"
    export LD_LIBRARY_PATH="/usr/local/cuda-12.1/lib64:$LD_LIBRARY_PATH"
    
    # Verify nvcc is now in PATH
    if command -v nvcc &> /dev/null; then
      CUDA_VERSION=$(nvcc --version | grep "release" | awk '{print $6}' | cut -c2-)
      log_success "CUDA toolkit version $CUDA_VERSION added to environment"
      return 0
    fi
  # Check for standard CUDA installation
  elif [ -d "/usr/local/cuda" ]; then
    log "Found standard CUDA installation, setting up environment..."
    export CUDA_HOME="/usr/local/cuda"
    export PATH="/usr/local/cuda/bin:$PATH"
    export LD_LIBRARY_PATH="/usr/local/cuda/lib64:$LD_LIBRARY_PATH"
    
    # Verify nvcc is now in PATH
    if command -v nvcc &> /dev/null; then
      CUDA_VERSION=$(nvcc --version | grep "release" | awk '{print $6}' | cut -c2-)
      log_success "CUDA toolkit version $CUDA_VERSION added to environment"
      return 0
    fi
  # Check for nvcc in PATH already
  elif command -v nvcc &> /dev/null; then
    NVCC_PATH=$(which nvcc)
    CUDA_HOME=$(dirname $(dirname $NVCC_PATH))
    log "Found CUDA in PATH at $CUDA_HOME"
    export CUDA_HOME="$CUDA_HOME"
    export LD_LIBRARY_PATH="$CUDA_HOME/lib64:$LD_LIBRARY_PATH"
    
    CUDA_VERSION=$(nvcc --version | grep "release" | awk '{print $6}' | cut -c2-)
    log_success "Using existing CUDA toolkit version $CUDA_VERSION"
    return 0
  fi
  
  # If we reach here, CUDA was not found
  log_warning "CUDA toolkit not found in standard locations"
  return 1
}

# Source the script if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "This is a utility script meant to be sourced, not executed directly."
  echo "Usage: source $(basename "${BASH_SOURCE[0]}")"
  exit 1
fi
