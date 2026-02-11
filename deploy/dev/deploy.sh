#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Connect Deployment Script
# This script handles a full deployment of the Connect application

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Important: We use SCRIPT_DIR for the top-level directory 
# but each module now uses MODULE_DIR internally to avoid path duplication
source "$SCRIPT_DIR/../modules/utils.sh"
source "$SCRIPT_DIR/../modules/env.sh"

show_header

ensure_repo_directory() {
  log "Ensuring repository directory exists: $REPO_DIR"
  
  run_with_sudo mkdir -p "$REPO_DIR"
  
  if [ -d "$REPO_DIR" ]; then
    run_with_sudo chown -R "$APP_USER:$APP_USER" "$REPO_DIR"
    log_success "Repository directory setup completed"
    return 0
  else
    log_error "Failed to create repository directory"
    return 1
  fi
}

create_deployment_dir() {
  log "Creating deployment directory: $APP_DIR"
  
  run_with_sudo mkdir -p "$APP_DIR"
  
  run_with_sudo chown -R "$APP_USER:$APP_GRP" "$APP_DIR"
  run_with_sudo chmod -R 750 "$APP_DIR"
  
  log_success "Deployment directory created"
  return 0
}

deploy_application() {
  log "Deploying application to $APP_DIR..."
  
  if [ ! -d "$REPO_DIR" ]; then
    log_error "Repository directory does not exist: $REPO_DIR"
    return 1
  fi
  
  local source_dir="$REPO_DIR/$SUBDIR"
  if [ ! -d "$source_dir" ]; then
    log_error "Source subdirectory does not exist: $source_dir"
    return 1
  fi
  
  if [ ! -d "$APP_DIR" ]; then
    log_error "Deployment directory does not exist: $APP_DIR"
    return 1
  fi
  
  run_with_sudo mkdir -p "$APP_DIR/data" "$APP_DIR/uploads" "$APP_DIR/models"
  
  log "Copying files from $source_dir to deployment directory..."
  run_with_sudo rsync -av --perms --delete \
      --exclude="node_modules" \
      --exclude=".git" \
      --exclude="uploads" \
      --exclude="deploy" \
      --exclude="deployment*" \
      --exclude="initial-prep" \
      --exclude="/models/" \
      "$source_dir/" "$APP_DIR/"
  
  log "Setting executable permissions on shell scripts..."
  run_with_sudo find "$APP_DIR" -type f -name "*.sh" -exec chmod +x {} \;
  
  log "Setting proper permissions for maintenance directories..."
  run_with_sudo chown -R "$APP_USER:www-data" "$APP_DIR/models"
  run_with_sudo chmod -R 2775 "$APP_DIR/models"
  
  run_with_sudo mkdir -p "$APP_DIR/data/backups"
  run_with_sudo chown -R "$APP_USER:www-data" "$APP_DIR/data/backups"
  run_with_sudo chmod -R 2775 "$APP_DIR/data/backups"
  
  run_with_sudo find "$APP_DIR/models" -type f -exec chmod 664 {} \;
  run_with_sudo find "$APP_DIR/data/backups" -type f -exec chmod 664 {} \;
  
  if [ -d "$source_dir/data" ] && [ ! -f "$APP_DIR/data/schema.sql" ]; then
    log "Copying data directory..."
    run_with_sudo rsync -av "$source_dir/data/" "$APP_DIR/data/"
  fi
  
  run_with_sudo chown -R "$APP_USER:$APP_GRP" "$APP_DIR"
  run_with_sudo chmod -R 750 "$APP_DIR"
  
  log_success "Application deployed to $APP_DIR"
  return 0
}

perform_preflight_checks() {
  log "Performing pre-flight checks..."
  
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
      if ! confirm "Continue with low memory?"; then
        return 1
      fi
    else
      log_success "Memory check passed (${available_memory}MB available)"
    fi
  else
    log_warning "Cannot check memory (free command not available)"
  fi
  
  local missing_deps=()
  for cmd in git curl node npm python3 sqlite3; do
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
  
  if [ ! -w "$(pwd)" ]; then
    log_error "Current directory is not writable"
    return 1
  fi
  log_success "Permission check passed"
  
  if [ -n "$REPO_DIR" ] && [ -n "$SUBDIR" ]; then
    if [ -d "$REPO_DIR/$SUBDIR" ]; then
      log_success "Repository structure validation passed"
    else
      log_error "Subdirectory $SUBDIR not found in repository at $REPO_DIR"
      log_error "Please ensure the repository is cloned with the correct structure"
      return 1
    fi
  fi
  
  log_success "All pre-flight checks passed"
  return 0
}

main() {
  log "Starting Connect deployment process..."
  
  if [ "$(id -u)" != "0" ]; then
    log_error "This script must be run as root or with sudo"
    exit 1
  fi
  
  if [ -n "$SUDO_USER" ]; then
    log_warning "Running as sudo from user: $SUDO_USER"
    SUDO_CONTEXT=true
  else
    SUDO_CONTEXT=false
  fi
  
  local skip_bootstrap=false
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
      --skip-bootstrap)
        skip_bootstrap=true
        shift
        ;;
      --help)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --skip-bootstrap    Skip the bootstrap process"
        echo "  --help              Show this help message"
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
      *)
        log_error "Unknown option or argument: $1"
        exit 1
        ;;
    esac
  done

  if [ -z "$instance_uri_arg" ]; then
    log_error "Missing mandatory argument: -u <instance_uri>"
    log_error "Example: -u https://my-instance.example.com"
    exit 1
  fi

  if [[ ! "$instance_uri_arg" =~ ^https?:// ]]; then
     log_error "Invalid URI format: $instance_uri_arg. Must start with http:// or https://"
     exit 1
  fi

  instance_domain_arg=$(echo "$instance_uri_arg" | sed -e 's|^[^/]*//||' -e 's|/.*$||')
  if [ -z "$instance_domain_arg" ]; then
      log_error "Could not extract domain from URI: $instance_uri_arg"
      exit 1
  fi

  export INSTANCE_URI_ARG="$instance_uri_arg"
  export INSTANCE_DOMAIN_ARG="$instance_domain_arg"
  log "Instance URI set to: $INSTANCE_URI_ARG"
  log "Instance Domain set to: $INSTANCE_DOMAIN_ARG"

  setup_environment "$INSTANCE_DOMAIN_ARG"
  
  if [ -f "$SCRIPT_DIR/.connect-env" ]; then
    log "Removing legacy .connect-env file from repository..."
    run_with_sudo rm -f "$SCRIPT_DIR/.connect-env"
    log_success "Legacy environment file removed"
  fi
  
  # Perform pre-flight checks
  if ! perform_preflight_checks; then
    log_error "Pre-flight checks failed"
    exit 1
  fi
  
  if [ "$skip_bootstrap" = false ]; then
    log "Running bootstrap process..."
    if ! "$SCRIPT_DIR/../production/bootstrap.sh"; then
      log_error "Bootstrap process failed"
      exit 1
    fi
  else
    log "Skipping bootstrap process as requested"
  fi
  
  if [ ! -d "$REPO_DIR" ]; then
    log_error "Repository directory does not exist: $REPO_DIR"
    log_error "Please ensure the repository is manually cloned before running this script"
    exit 1
  fi
  
  if ! create_deployment_dir; then
    log_error "Failed to create deployment directory"
    exit 1
  fi
  
  log "Syncing repository from $REPO_DIR to $APP_DIR..."
  if [ -d "$REPO_DIR/$SUBDIR" ]; then
    run_with_sudo mkdir -p "$APP_DIR/data" "$APP_DIR/uploads" "$APP_DIR/models"
    
    local db_path="$APP_DIR/data/${APP_NAME,,}.db"
    if [ -f "$db_path" ]; then
      log_warning "Existing database detected during initial deployment!"
      
      local backup_dir="$APP_DIR/data/backups"
      local timestamp=$(date +%Y-%m-%dT%H-%M-%S-%3NZ)
      local backup_file="$backup_dir/pre-deploy-$timestamp.db"
      
      log "Creating backup of existing database: $backup_file"
      ensure_dir "$backup_dir"
      
      if sqlite3 "$db_path" ".backup '$backup_file'"; then
        log_success "Database backed up successfully before deployment"
      else
        log_error "Failed to back up existing database. Continuing with caution."
      fi
    fi
    
    log "Copying files from $REPO_DIR/$SUBDIR to deployment directory..."
    run_with_sudo rsync -av --perms --delete \
        --exclude="node_modules" \
        --exclude=".git" \
        --exclude="uploads" \
        --exclude="deploy" \
        --exclude="deployment*" \
        --exclude="initial-prep" \
        --exclude="/models/" \
        "$REPO_DIR/$SUBDIR/" "$APP_DIR/"
    
    run_with_sudo chown -R "$APP_USER:$APP_GRP" "$APP_DIR"
    run_with_sudo chmod -R 750 "$APP_DIR"
    
    log_success "Repository synced to application directory"
  else
    log_error "Subdirectory $SUBDIR not found in repository at $REPO_DIR"
    log_error "Cannot sync repository to application directory"
    exit 1
  fi
  
  if ! deploy_application; then
    log_error "Failed to deploy application"
    exit 1
  fi

  log "Initializing instance-specific .env files in $APP_DIR..."
  if ! command_exists init_env_file; then
      log "Sourcing env.sh again to ensure functions are available..."
          source "$SCRIPT_DIR/../modules/env.sh"
  fi
  init_env_file "$APP_DIR" "$INSTANCE_URI_ARG"
  init_frontend_env "$APP_DIR" "$INSTANCE_URI_ARG"
  log_success ".env files initialized for $INSTANCE_URI_ARG"
  
  log "Setting up Python virtual environment..."
  source "$SCRIPT_DIR/../modules/python.sh"
  source "$SCRIPT_DIR/../modules/fix_permissions.sh"
  
  log "Fixing core permissions before Python setup..."
  if ! fix_app_core_permissions; then
    log_warning "Failed to fix core permissions before Python setup"
  fi
  
  if ! setup_python_for_user "$APP_USER"; then
    log_warning "Failed to set up Python virtual environment. Some features may not work correctly."
  fi
  
  log "Installing npm packages using system Node.js..."
  
  source "$SCRIPT_DIR/../modules/node.sh"
  
  if ! verify_node "16.0.0"; then
    log_error "System Node.js verification failed."
    exit 1
  fi
  
  log "Configuring npm to install all dependencies..."
  echo 'production=false' > "$APP_DIR/.npmrc"
  run_with_sudo chown "$APP_USER:$APP_GRP" "$APP_DIR/.npmrc"
  
  log "Cleaning npm cache and install directories..."
  run_with_sudo rm -rf "$APP_DIR/node_modules" "$APP_DIR/package-lock.json"
  
  cd "$APP_DIR" || {
    log_error "Failed to change to app directory: $APP_DIR"
    exit 1
  }
  
  log "Cleaning npm cache..."
  if ! run_as_user "$APP_USER" npm cache clean --force; then
    log_warning "npm cache clean warning - continuing regardless"
  fi
  
  log "Installing npm packages with production=false..."
  if ! run_as_user "$APP_USER" npm install --no-package-lock; then
    log_warning "First npm install attempt failed, trying again with legacy peer deps flag..."
    if ! run_as_user "$APP_USER" npm install --no-package-lock --legacy-peer-deps; then
      log_error "Failed to install npm packages. The application may not work correctly."
    fi
  fi
  
  if [ ! -d "$APP_DIR/node_modules/express" ]; then
    log_warning "Express module not found in node_modules. Trying explicit install..."
    run_as_user "$APP_USER" npm install express
  fi
  
  if [ ! -d "$APP_DIR/node_modules/bcrypt" ]; then
    log_warning "bcrypt module not found in node_modules. Trying explicit install..."
    run_as_user "$APP_USER" npm install bcrypt
  fi
  
  log "Ensuring sqlite3 is properly installed..."
  run_as_user "$APP_USER" npm install sqlite3 --build-from-source
  
  if [ ! -d "$APP_DIR/node_modules/sqlite3" ]; then
    log_warning "Failed to install sqlite3 module. Trying again with force install..."
    run_as_user "$APP_USER" npm install sqlite3 --force --build-from-source
  fi
  
  log "Building application..."
  source "$SCRIPT_DIR/../modules/build.sh"
  
  log "Running full application build process..."
  run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && $SCRIPT_DIR/../modules/build.sh"
  
  if [ -d "$APP_DIR/frontend" ]; then
    log "Frontend components already built by build.sh module"
    if [ -d "$APP_DIR/frontend/build" ] && [ -f "$APP_DIR/frontend/build/index.html" ]; then
      log_success "Frontend build verified successfully"
    else
      log_warning "Frontend build directory not found - build may have failed, but continuing deployment"
    fi
  else
    log_warning "No frontend directory found in $APP_DIR, skipping frontend build"
  fi
  
  log "Initializing database schema..."
  if [ -f "$APP_DIR/setup/init-db.js" ]; then
    cd "$APP_DIR" || {
      log_error "Failed to change to app directory for database initialization"
      exit 1
    }
    
    export NODE_PATH="$APP_DIR/node_modules:$NODE_PATH"
    
    log "Running database initialization (admin creation enabled for initial deploy)"
    run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && NODE_ENV=production NODE_PATH=\"$APP_DIR/node_modules:\$NODE_PATH\" node \"$APP_DIR/setup/init-db.js\""
    log_success "Database schema initialized successfully"
  else
    log_warning "Database initialization script not found at $APP_DIR/setup/init-db.js"
  fi
  
  log "Configuring and starting PM2..."
  source "$SCRIPT_DIR/../modules/pm2.sh"
  
  if ! configure_pm2_for_user "$APP_USER" "$APP_DIR" "${APP_NAME,,}"; then
    log_error "Failed to configure and start PM2"
    exit 1
  fi
  
  log "Configuring Caddy..."
  source "$SCRIPT_DIR/../modules/caddy.sh"
  
  log "Domain passed to configure_caddy: [$INSTANCE_DOMAIN_ARG]"
  if ! configure_caddy "$INSTANCE_DOMAIN_ARG"; then
    log_error "Failed to configure Caddy for domain $INSTANCE_DOMAIN_ARG"
    exit 1
  fi
  
  log "Applying final permission fixes..."
  if ! command_exists fix_app_core_permissions; then
    source "$SCRIPT_DIR/../modules/fix_permissions.sh"
  fi
  
  if ! fix_app_core_permissions; then
    log_warning "Final permission fix warning: Some permission issues may still be present."
  fi
  
  log "Fixing permissions for maintenance directories..."
  if [ -f "$APP_DIR/scripts/fix_maintenance_permissions.sh" ]; then
    log "Running maintenance permissions fix script..."
    if ! run_with_sudo bash -c "cd \"$APP_DIR\" && APP_USER=\"$APP_USER\" ./scripts/fix_maintenance_permissions.sh"; then
      log_warning "Failed to fix maintenance directory permissions. Maintenance tab functionality may be limited."
    fi
  else
    log_warning "Maintenance permissions fix script not found at $APP_DIR/scripts/fix_maintenance_permissions.sh"
    log "Applying fallback permission fix for maintenance directories..."
    
    local backups_dir="$APP_DIR/data/backups"
    if [ -d "$backups_dir" ]; then
      log "Setting permissions for backups directory: $backups_dir"
      run_with_sudo chown -R "$APP_USER:www-data" "$backups_dir"
      run_with_sudo chmod -R 2775 "$backups_dir"
    fi
    
    local models_dir="$APP_DIR/models"
    if [ -d "$models_dir" ]; then
      log "Setting permissions for models directory: $models_dir"
      run_with_sudo chown -R "$APP_USER:www-data" "$models_dir"
      run_with_sudo chmod -R 2775 "$models_dir"
    fi
  fi
  
  log_success "Deployment process completed successfully!"
  log ""
  log "Your application is now available at: https://$DOMAIN (if SSL is enabled)"
  log "or http://$DOMAIN (if SSL is not enabled)"
  log ""
  log "To update the application in the future, use: sudo $SCRIPT_DIR/update.sh -u $INSTANCE_URI_ARG"
  log ""
  
  return 0
}

# Run the main function
main "$@"
