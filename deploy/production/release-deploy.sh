#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Connect Deployment Release Script
# This script handles a full deployment of the Connect application from a GitHub release.

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Source shared modules
source "$SCRIPT_DIR/../modules/utils.sh"
source "$SCRIPT_DIR/../modules/env.sh"

show_header

perform_preflight_checks() {
  log "Performing pre-flight checks..."
  
  # Check for critical dependencies
  local missing_deps=()
  for cmd in git curl node npm python3 sqlite3 jq unzip; do
    if ! command_exists $cmd; then
      missing_deps+=($cmd)
    fi
  done
  
  if [ ${#missing_deps[@]} -gt 0 ]; then
    log_error "Missing required dependencies: ${missing_deps[*]}"
    log "Please install these dependencies before proceeding"
    return 1
  fi
  log_success "Dependency check passed"
  
  # Add disk space and memory checks from deploy.sh
  local available_space=$(df -m / | awk 'NR==2 {print $4}')
  local min_required_space=2000 # 2GB minimum
  
  if [ "$available_space" -lt "$min_required_space" ]; then
    log_error "Not enough disk space. Available: ${available_space}MB, Required: ${min_required_space}MB"
    return 1
  fi
  log_success "Disk space check passed (${available_space}MB available)"
  
  if command_exists free; then
    local available_memory=$(free -m | awk 'NR==2 {print $7}')
    local min_required_memory=512 # 512MB minimum
    
    if [ "$available_memory" -lt "$min_required_memory" ]; then
      log_warning "Low memory. Available: ${available_memory}MB, Recommended: ${min_required_memory}MB"
    else
      log_success "Memory check passed (${available_memory}MB available)"
    fi
  fi
  
  log_success "All pre-flight checks passed"
  return 0
}

create_deployment_dir() {
  log "Creating deployment directory: $APP_DIR"
  run_with_sudo mkdir -p "$APP_DIR"
  run_with_sudo chown -R "$APP_USER:$APP_GRP" "$APP_DIR"
  run_with_sudo chmod -R 750 "$APP_DIR"
  log_success "Deployment directory created"
  return 0
}

deploy_from_release() {
    log "Starting deployment from extracted release..."
    
    local source_dir
    source_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
    log "Using source directory for deployment: $source_dir"

    if [ ! -d "$APP_DIR" ]; then
        log_error "Deployment directory $APP_DIR does not exist!"
        log_error "Please run the bootstrap.sh script first."
        exit 1
    fi

    log "Syncing application files from $source_dir to $APP_DIR..."
    run_with_sudo rsync -av --perms --delete \
        --exclude="node_modules" \
        --exclude=".git" \
        --exclude="deploy" \
        "$source_dir/" "$APP_DIR/"

    log "Initializing instance-specific .env files in $APP_DIR..."
    if ! command_exists init_env_file; then
        source "$SCRIPT_DIR/../modules/env.sh"
    fi
    init_env_file "$APP_DIR" "$INSTANCE_URI_ARG"
    init_frontend_env "$APP_DIR" "$INSTANCE_URI_ARG"
    log_success ".env files initialized for $INSTANCE_URI_ARG"

    log "Setting up Python virtual environment..."
    source "$SCRIPT_DIR/../modules/python.sh"
    source "$SCRIPT_DIR/../modules/fix_permissions.sh"
    if ! setup_python_for_user "$APP_USER"; then
      log_warning "Failed to set up Python virtual environment."
    fi

    log "Installing npm packages..."
    source "$SCRIPT_DIR/../modules/node.sh"
    if ! verify_node "16.0.0"; then
      log_error "System Node.js verification failed."
      exit 1
    fi
    cd "$APP_DIR" || { log_error "Failed to change to app directory: $APP_DIR"; exit 1; }
    run_as_user "$APP_USER" npm install --no-package-lock --legacy-peer-deps || log_error "Failed to install npm packages."

    log "Building application..."
    source "$SCRIPT_DIR/../modules/build.sh"
    run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && $SCRIPT_DIR/../modules/build.sh"

    log "Initializing database schema..."
    if [ -f "$APP_DIR/setup/init-db.js" ]; then
      cd "$APP_DIR" || exit 1
      export NODE_PATH="$APP_DIR/node_modules:$NODE_PATH"
      run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && NODE_ENV=production node \"$APP_DIR/setup/init-db.js\""
      log_success "Database schema initialized."
    else
      log_warning "Database initialization script not found."
    fi

    log "Configuring and starting PM2..."
    source "$SCRIPT_DIR/../modules/pm2.sh"
    if ! configure_pm2_for_user "$APP_USER" "$APP_DIR" "${APP_NAME,,}"; then
      log_error "Failed to configure and start PM2"
      exit 1
    fi

    log "Configuring Caddy..."
    source "$SCRIPT_DIR/../modules/caddy.sh"
    if ! configure_caddy "$INSTANCE_DOMAIN_ARG"; then
      log_error "Failed to configure Caddy for domain $INSTANCE_DOMAIN_ARG"
      exit 1
    fi

    log "Applying final permission fixes..."
    fix_app_core_permissions || log_warning "Final permission fix warning."

    log "Setting proper permissions for maintenance directories..."
    run_with_sudo chown -R "$APP_USER:www-data" "$APP_DIR/models"
    run_with_sudo chmod -R 2775 "$APP_DIR/models"
    run_with_sudo mkdir -p "$APP_DIR/data/backups"
    run_with_sudo chown -R "$APP_USER:www-data" "$APP_DIR/data/backups"
    run_with_sudo chmod -R 2775 "$APP_DIR/data/backups"
    
    log_success "Deployment from release completed successfully!"
    log "Your application is now available at: https://$DOMAIN"
}

main() {
  log "Starting Connect Release Deployment..."
  
  # Check if running as root
  if [ "$(id -u)" != "0" ]; then
    log_error "This script must be run as root or with sudo"
    exit 1
  fi
  
  # Parse command-line arguments
  local instance_uri_arg=""
  while [[ $# -gt 0 ]]; do
    case $1 in
      -u)
        if [[ -n "$2" ]] && [[ ! "$2" =~ ^-- ]]; then
          instance_uri_arg="$2"
          shift 2
        else
          log_error "Argument for -u is missing" >&2
          exit 1
        fi
        ;;
      --help)
        echo "Usage: $0 -u <instance_uri>"
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done

  if [ -z "$instance_uri_arg" ]; then
    log_error "Missing mandatory argument: -u <instance_uri>"
    exit 1
  fi

  if [[ ! "$instance_uri_arg" =~ ^https?:// ]]; then
     log_error "Invalid URI format: $instance_uri_arg."
     exit 1
  fi

  instance_domain_arg=$(echo "$instance_uri_arg" | sed -e 's|^[^/]*//||' -e 's|/.*$||')
  export INSTANCE_URI_ARG="$instance_uri_arg"
  export INSTANCE_DOMAIN_ARG="$instance_domain_arg"
  
  setup_environment "$INSTANCE_DOMAIN_ARG"

  if ! perform_preflight_checks; then
    log_error "Pre-flight checks failed. Aborting."
    exit 1
  fi
  
  deploy_from_release
  
  log_success "Release deployment script finished."
}

main "$@"
