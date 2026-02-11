#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Connect Deployment Update Script
# This script updates an existing deployment with the latest code

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Important: We use SCRIPT_DIR for the top-level directory
# but each module now uses MODULE_DIR internally to avoid path duplication
source "$SCRIPT_DIR/../modules/utils.sh"
source "$SCRIPT_DIR/../modules/env.sh" # Load existing env vars
# Source node.sh and python.sh later when needed
source "$SCRIPT_DIR/../modules/fix_permissions.sh"

show_header

update_repository() {
  local branch="${1:-main}"
  log "Updating repository in $REPO_DIR (branch: $branch)..."
  if [ ! -d "$REPO_DIR/.git" ]; then log_error "Repository not found at $REPO_DIR"; return 1; fi
  cd "$REPO_DIR" || { log_error "Failed to change to repository directory"; return 1; }
  run_as_user "$APP_USER" git fetch --all
  if run_as_user "$APP_USER" git status --porcelain | grep -q .; then log_warning "Local changes detected - forcing reset"; fi
  run_as_user "$APP_USER" git checkout "$branch" -f
  run_as_user "$APP_USER" git reset --hard origin/"$branch"
  run_as_user "$APP_USER" git clean -fd
  run_as_user "$APP_USER" git pull origin "$branch" --force
  log_success "Repository forcefully updated to match origin/$branch"
  run_with_sudo chown -R "$APP_USER:$APP_USER" "$REPO_DIR"
  log_success "Repository updated successfully"
  return 0
}

update_deployment() {
  log "Updating deployment in $APP_DIR..."
  if [ ! -d "$APP_DIR" ]; then log_error "Deployment directory does not exist: $APP_DIR"; return 1; fi
  local source_dir="$REPO_DIR/$SUBDIR"
  if [ ! -d "$source_dir" ]; then log_error "Source subdirectory does not exist: $source_dir"; return 1; fi
  run_with_sudo mkdir -p "$APP_DIR/models"
  log "Copying files from $source_dir to deployment directory..."
  run_with_sudo rsync -av --perms --delete \
      --exclude="node_modules" \
      --exclude=".git" \
      --exclude="uploads" \
      --exclude="deploy" \
      --exclude="deployment*" \
      --exclude="initial-prep" \
      --exclude="data/" \
      --exclude="data/hardware" \
      --exclude="/models/" \
      --exclude="venv/" \
      --exclude="frontend/.env.production" \
      --exclude=".env.production" \
      --exclude=".env" \
      --exclude="model_config.json" \
      --exclude="ecosystem.config.js" \
      "$source_dir/" "$APP_DIR/"
  
  log "Explicitly preserving main venv/ directory while allowing cleanup of other virtual environments..."
  
  # Ensure shell scripts are executable after deployment
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
  run_with_sudo chown -R "$APP_USER:$APP_GRP" "$APP_DIR"
  log_success "Deployment updated successfully"
  return 0
}

restart_application() {
  log "Restarting application..."
  source "$SCRIPT_DIR/../modules/pm2.sh"
  local ABSOLUTE_APP_DIR="$APP_DIR" # Assume APP_DIR is already absolute from env.sh
  if [[ "$APP_DIR" == "./"* ]]; then ABSOLUTE_APP_DIR="$APP_HOME/${APP_DIR#./}"; fi
  configure_pm2_for_user "$APP_USER" "$ABSOLUTE_APP_DIR" "${APP_NAME,,}" || { log_error "Failed to configure and start PM2"; return 1; }
  log_success "Application restarted successfully"
  return 0
}

main() {
  log "Starting Connect update process..."

  local preliminary_app_dir="$SCRIPT_DIR"
  if [ -n "$APP_DIR_ENV_VAR" ]; then
      preliminary_app_dir="$APP_DIR_ENV_VAR"
  fi
  
  MAINTENANCE_FLAG_FILE="${preliminary_app_dir}/maintenance_on.flag" 
  MAINTENANCE_HTML_SRC="$SCRIPT_DIR/../templates/maintenance.html"

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
  
  local branch="main"
  local skip_build=false
  local instance_uri_arg="" # For optional -u flag

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
      --branch=*)
        branch="${1#*=}"
        shift
        ;;
      --skip-build)
        skip_build=true
        shift
        ;;
      --help)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  -u <instance_uri>   Optional: Update domain/URI and reconfigure Caddy/SSL."
        echo "  --branch=BRANCH     Branch to check out (default: main)"
        echo "  --skip-build        Skip the build process"
        echo "  --help              Show this help message"
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        exit 1
        ;;
    esac
  done

  local instance_domain_arg=""
  if [ -n "$instance_uri_arg" ]; then
      log "Instance URI provided via -u flag: $instance_uri_arg"
      if [[ ! "$instance_uri_arg" =~ ^https?:// ]]; then
         log_error "Invalid URI format for -u: $instance_uri_arg. Must start with http:// or https://"
         exit 1
      fi
      instance_domain_arg=$(echo "$instance_uri_arg" | sed -e 's|^[^/]*//||' -e 's|/.*$||')
      if [ -z "$instance_domain_arg" ]; then
          log_error "Could not extract domain from URI: $instance_uri_arg"
          exit 1
      fi
      log "Instance Domain will be updated to: $instance_domain_arg"
  else
      log "No -u flag provided. Domain/URI settings will not be changed."
  fi

  setup_environment "$instance_domain_arg"

  MAINTENANCE_HTML_DEST_DIR="$APP_DIR/public_static"
  MAINTENANCE_HTML_DEST_FILE="$MAINTENANCE_HTML_DEST_DIR/maintenance.html"

  log "Stopping all PM2 processes as user $APP_USER..."
  run_as_user "$APP_USER" "pm2 stop all" || log_warning "pm2 stop all command as $APP_USER failed (maybe no processes running or permission issue?), continuing..."
  
  log "Ensuring maintenance page directory exists: $MAINTENANCE_HTML_DEST_DIR"
  run_with_sudo mkdir -p "$MAINTENANCE_HTML_DEST_DIR"
  run_with_sudo chown "$APP_USER:$APP_GRP" "$MAINTENANCE_HTML_DEST_DIR"
  run_with_sudo chmod 755 "$MAINTENANCE_HTML_DEST_DIR"

  log "Copying maintenance page to $MAINTENANCE_HTML_DEST_FILE..."
  if [ -f "$MAINTENANCE_HTML_SRC" ]; then
    run_with_sudo cp "$MAINTENANCE_HTML_SRC" "$MAINTENANCE_HTML_DEST_FILE"
    run_with_sudo chown "$APP_USER:$APP_GRP" "$MAINTENANCE_HTML_DEST_FILE"
    run_with_sudo chmod 644 "$MAINTENANCE_HTML_DEST_FILE"
  else
    log_error "Maintenance HTML source file not found at $MAINTENANCE_HTML_SRC. Maintenance page might not display correctly if backend is down."
  fi
  
  if [ -f "$SCRIPT_DIR/.connect-env" ]; then
    log "Removing legacy .connect-env file from repository..."
    run_with_sudo rm -f "$SCRIPT_DIR/.connect-env"
    log_success "Legacy environment file removed"
  fi
  
  update_repository "$branch" || {
    log_error "Failed to update repository"
    exit 1
  }
  
  log "Checking for database schema changes..."
  local db_path="$APP_DIR/data/mcp.db"
  local backup_dir="$APP_DIR/data/backups"
  
  backup_database_if_needed "$db_path" "$backup_dir" || {
    log_warning "Database backup check failed, but continuing with update"
  }
  
  update_deployment || {
    log_error "Failed to update deployment"
    exit 1
  }

  if [ -n "$instance_uri_arg" ]; then
      log "Updating .env files and Caddy due to -u flag..."
      if ! command_exists init_env_file; then
          log "Sourcing env.sh again to ensure functions are available..."
          source "$SCRIPT_DIR/../modules/env.sh"
      fi
      init_env_file "$APP_DIR" "$instance_uri_arg" || { log_error "Failed to update .env.production"; exit 1; }
      init_frontend_env "$APP_DIR" "$instance_uri_arg" || { log_error "Failed to update frontend/.env.production"; exit 1; }
      log_success ".env files updated in $APP_DIR"

      log "Reconfiguring Caddy for new domain: $instance_domain_arg"
      if ! command_exists configure_caddy; then
          log "Sourcing caddy.sh again..."
          source "$SCRIPT_DIR/../modules/caddy.sh"
      fi
      if ! configure_caddy "$instance_domain_arg"; then
          log_error "Failed to reconfigure Caddy for new domain $instance_domain_arg"
          log_warning "Continuing update despite Caddy reconfiguration failure."
      else
          log_success "Caddy reconfigured for $instance_domain_arg"
      fi
  fi
  
  log "Fixing core permissions..."
  if ! command_exists fix_app_core_permissions; then
    source "$SCRIPT_DIR/../modules/fix_permissions.sh"
  fi
  
  fix_app_core_permissions || {
    log_warning "Failed to fix core permissions"
  }
  
  log "Updating Python virtual environment..."
  source "$SCRIPT_DIR/../modules/python.sh"
  
  setup_python_for_user "$APP_USER" || {
    log_warning "Failed to update Python virtual environment. Some features may not work correctly."
  }
  
  log "Updating npm packages using system Node.js..."
  
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
    log_warning "npm install failed, trying with --legacy-peer-deps...";
    if ! run_as_user "$APP_USER" npm install --no-package-lock --legacy-peer-deps; then log_warning "Failed to install npm packages."; fi
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
  run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && npm install sqlite3"
  
  if [ ! -d "$APP_DIR/node_modules/sqlite3" ]; then
    log_warning "Failed to install sqlite3 module. Trying again with force install..."
    run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && npm install sqlite3 --force"
  fi
  
  if [ "$skip_build" = false ]; then
    log "Updating Browserslist database..."
    run_as_user "$APP_USER" bash -c "cd \"$APP_DIR/frontend\" && npx update-browserslist-db@latest" || log_warning "Failed to update Browserslist DB, build may use old data."

    log "Building application..."
    chmod +x "$SCRIPT_DIR/../modules/build.sh" 
    
    cd "$APP_DIR" || {
      log_error "Failed to change to app directory for build"
      exit 1
    }
    
    log "Running full application build process in $APP_DIR..."
    run_as_user "$APP_USER" bash -c "export APP_DIR=\"$APP_DIR\"; export DOMAIN=\"$DOMAIN\"; cd \"$APP_DIR\" && \"$SCRIPT_DIR/../modules/build.sh\"" || {
        log_error "Application build process failed"
    }
    
    if [ -d "$APP_DIR/frontend" ]; then
      log "Frontend components already built by build.sh module"
      if [ -d "$APP_DIR/frontend/build" ] && [ -f "$APP_DIR/frontend/build/index.html" ]; then
        log_success "Frontend build verified successfully"
      else
        log_warning "Frontend build directory not found - build may have failed"
      fi
    fi
  else
    log "Skipping build process as requested"
  fi
  
  log "Checking if database schema needs to be updated..."
  if [ -f "$APP_DIR/setup/init-db.js" ]; then
    cd "$APP_DIR" || { log_error "Failed to cd to $APP_DIR for DB init"; exit 1; }
    export NODE_PATH="$APP_DIR/node_modules:$NODE_PATH"
    log "Running database schema check with password protection";
    run_as_user "$APP_USER" bash -c "cd \"$APP_DIR\" && NODE_ENV=production PRESERVE_ADMIN_PASSWORD=true NEVER_RESET_ADMIN_PASSWORD=true DB_ADMIN_PASSWORD_PROTECTED=true CRITICAL_PASSWORD_LOCK=true NODE_PATH=\"$APP_DIR/node_modules:\$NODE_PATH\" node \"$APP_DIR/setup/init-db.js\" --check"
    log_success "Database schema check completed"
  else log_warning "Database initialization script not found"; fi

  restart_application || { log_error "Failed to restart application"; exit 1; }

  log "Applying final permission fixes..."; source "$SCRIPT_DIR/../modules/fix_permissions.sh"
  fix_app_core_permissions || { log_warning "Final permission fix warning"; }

  log "Fixing permissions for maintenance directories...";
  if [ -f "$APP_DIR/scripts/fix_maintenance_permissions.sh" ]; then
    log "Running maintenance permissions fix script...";
    run_with_sudo bash -c "cd \"$APP_DIR\" && APP_USER=\"$APP_USER\" ./scripts/fix_maintenance_permissions.sh" || { log_warning "Failed to fix maintenance directory permissions."; }
  else
    log_warning "Maintenance permissions fix script not found. Applying fallback...";
    local backups_dir="$APP_DIR/data/backups"; if [ -d "$backups_dir" ]; then log "Setting permissions for $backups_dir"; run_with_sudo chown -R "$APP_USER:www-data" "$backups_dir"; run_with_sudo chmod -R 2775 "$backups_dir"; fi
    local models_dir="$APP_DIR/models"; if [ -d "$models_dir" ]; then log "Setting permissions for $models_dir"; run_with_sudo chown -R "$APP_USER:www-data" "$models_dir"; run_with_sudo chmod -R 2775 "$models_dir"; fi
  fi

  log_success "Update process completed successfully!"
  log ""
  log "Your application has been updated and restarted."

  log "It is available at: https://$DOMAIN (if SSL is enabled)"
  log "or http://$DOMAIN (if SSL is not enabled)"
  log ""

  log "Performing final explicit restart of all application services as user $APP_USER..."
  run_as_user "$APP_USER" "cd \"$APP_DIR\" && pm2 restart ecosystem.config.js" || log_warning "Final explicit restart command failed, check PM2 status manually."
  log "Caddy should now serve the application. If Caddy config was changed (e.g. by -u flag), it would have been reloaded by that step."

  log_success "Update process fully completed!"
  return 0
}

main "$@"
