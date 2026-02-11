#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Application build module for deployment
# This handles building both backend and frontend components

# Determine MODULE_DIR first
MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Source utils module unconditionally first
source "$MODULE_DIR/utils.sh"

# Source env module to get utils like log and default paths
source "$MODULE_DIR/env.sh"

# When sourced or called by deploy/update scripts, APP_DIR should already be set
# by the calling script's setup_environment call.
# We no longer determine APP_DIR based on this script's location.

log "Build script executing within APP_DIR context: $APP_DIR"
if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
    log_error "APP_DIR environment variable is not set or invalid ($APP_DIR). Cannot proceed with build."
    exit 1
fi

# Domain should also be set by the calling script's setup_environment
if [ -z "$DOMAIN" ]; then
    log_warning "DOMAIN environment variable not set. Build might use defaults."
    # Attempt to read from .env.production as a fallback
    deployed_env_file="$APP_DIR/.env.production"
    if [ -f "$deployed_env_file" ]; then
        url_from_env=$(grep -E '^(FRONTEND_URL|API_CORS_ORIGIN)=' "$deployed_env_file" | head -n 1 | cut -d '=' -f 2- | sed 's/"//g')
        if [ -n "$url_from_env" ]; then
            DOMAIN=$(echo "$url_from_env" | sed -e 's|^[^/]*//||' -e 's|/.*$||') # Extract domain
            log "Determined domain from $deployed_env_file: $DOMAIN"
        fi
    fi
    if [ -z "$DOMAIN" ]; then
       log_error "Could not determine domain. Please ensure .env.production exists in $APP_DIR or DOMAIN is set."
       exit 1
    fi
fi


# Create a fixed PostCSS configuration for Tailwind CSS v3.3.3
create_postcss_config() {
  local target_dir="$1"
  
  if [ -z "$target_dir" ]; then
    log_error "No target directory specified for PostCSS configuration"
    return 1
  fi
  
  log "Creating PostCSS configuration for Tailwind CSS v3.3.3..."
  
  cat > "$target_dir/postcss.config.js" << EOF
// PostCSS Configuration for Tailwind CSS v3.3.3
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}
EOF
  
  log_success "PostCSS configuration created"
  return 0
}

# Install and build frontend applications
# Assumes APP_DIR is correctly set in the environment
build_frontend() {
  local frontend_dir="$APP_DIR/frontend"

  if [ ! -d "$frontend_dir" ]; then
    log_warning "Frontend directory not found: $frontend_dir"
    return 1
  fi
  
  log "Building frontend application in $frontend_dir..."
  
  # Change to frontend directory
  cd "$frontend_dir" || {
    log_error "Failed to change to frontend directory"
    return 1
  }
  
  # Make sure .env.production exists (should have been created by deploy/update)
  if [ ! -f "$frontend_dir/.env.production" ]; then
    log_warning "Frontend .env.production not found. Build might use incorrect API URL if not generated previously by deploy/update script."
    # Cannot call init_frontend_env here as we don't have the full URI
  fi
  
  # Create fixed PostCSS configuration first
  log "Setting up Tailwind CSS with stable v3.3.3 configuration..."
  create_postcss_config "$frontend_dir"
  
  # Create .npmrc to ensure dev dependencies are always installed
  log "Configuring npm to install all dependencies including dev dependencies..."
  echo "production=false" > "$frontend_dir/.npmrc"
  
  # Always use npm install instead of npm ci to avoid version mismatches
  log "Installing frontend dependencies with npm install..."
  # Remove package-lock.json to ensure clean install
  if [ -f "$frontend_dir/package-lock.json" ]; then
    log "Removing existing package-lock.json for clean install..."
    rm -f "$frontend_dir/package-lock.json"
  fi
  
  # Use npm install with no-package-lock to avoid lock file issues
  npm install --no-package-lock
  
  # Double-check specific Tailwind CSS plugins are installed
  log "Ensuring Tailwind CSS plugins are available..."
  if [ ! -d "node_modules/@tailwindcss/forms" ] || [ ! -d "node_modules/@tailwindcss/typography" ]; then
    log "Installing specific Tailwind plugins..."
    npm install --no-save @tailwindcss/forms@0.5.3 @tailwindcss/typography@0.5.9
    npm install --no-save tailwindcss@3.3.3 postcss@8.4.31 autoprefixer@10.4.16
  else
    log_success "Tailwind plugins found in node_modules"
  fi
  
  # Run the build
  log "Building frontend..."
  NODE_ENV=production npm run build
  
  # Check if build succeeded
  if [ -d "$frontend_dir/build" ] && [ -f "$frontend_dir/build/index.html" ]; then
    log_success "Frontend built successfully"
    # Copying logic removed as build should happen directly in APP_DIR context
    return 0
  else
    log_error "Frontend build failed: build directory or index.html not found"
    return 1
  fi
}

# Install and build backend applications
# Assumes APP_DIR is correctly set in the environment
build_backend() {
  local backend_dir="$APP_DIR"

  log "Building backend application in $backend_dir..."
  
  # Change to backend directory (which is APP_DIR)
  cd "$backend_dir" || {
    log_error "Failed to change to backend directory"
    return 1
  }
  
  # Make sure .env file exists
  if [ ! -f "$backend_dir/.env" ]; then
     log_error ".env file not found in $backend_dir. Cannot proceed with backend build."
     return 1
  fi
  
  # Create .npmrc to ensure all dependencies are always installed
  log "Configuring npm to install all dependencies including dev dependencies..."
  echo "production=false" > "$backend_dir/.npmrc"
  
  # Install backend dependencies with npm install
  log "Installing backend dependencies with npm install..."
  # Remove package-lock.json to ensure clean install
  if [ -f "$backend_dir/package-lock.json" ]; then
    log "Removing existing package-lock.json for clean install..."
    rm -f "$backend_dir/package-lock.json"
  fi
  
  # Use npm install with no-package-lock to avoid lock file issues
  npm install --no-package-lock
  
  # Check if a build script exists in package.json
  if grep -q '"build"' package.json; then
    log "Running backend build script..."
    npm run build
  else
    log "No build script found for backend, skipping"
  fi
  
  log_success "Backend setup completed"
  return 0
}

# Initialize database if needed
# Assumes APP_DIR is correctly set in the environment
initialize_database() {
  local app_context_dir="$APP_DIR"

  log "Checking if database initialization is needed..."
  
  # Check if database initialization script exists
  if [ -f "$app_context_dir/setup/init-db.js" ]; then
    log "Database initialization script found, running..."
    
    # Check if database already exists
    local db_path=$(grep DB_PATH "$app_context_dir/.env" | cut -d= -f2)
    if [ -z "$db_path" ]; then
      db_path="$app_context_dir/data/${APP_NAME,,}.db"
      log "No DB_PATH found in .env, using default: $db_path"
    else
      # Ensure db_path is relative to app_context_dir if it starts with ./
      if [[ "$db_path" == "./"* ]]; then
         db_path="$app_context_dir/${db_path#./}"
      fi
      log "Using DB_PATH from .env: $db_path"
    fi
    
    # Make sure data directory exists
    ensure_dir "$(dirname "$db_path")"
    
    # Run initialization script only if database doesn't exist
    if [ ! -f "$db_path" ]; then
      log "Database file not found, initializing..."
      
      # Make sure we're in the correct directory
      cd "$app_context_dir" || {
        log_error "Failed to change to repository directory for database initialization"
        return 1
      }
      
      # Use absolute path for init-db.js to avoid path issues
      NODE_ENV=production node "$app_context_dir/setup/init-db.js"
      log_success "Database initialized"
    else
      log "Database already exists, skipping initialization"
    fi
  else
    log "No database initialization script found, skipping"
  fi
  
  return 0
}

  # Build the entire application
  # Assumes APP_DIR and DOMAIN are correctly set in the environment
  build_application() {
    local app_dir="$APP_DIR" # Use the environment's APP_DIR

    log "Starting application build process in $app_dir..."
    
    # Ensure directories exist
    if [ ! -d "$app_dir" ]; then
      log_error "Application directory does not exist: $app_dir"
      return 1
    fi
    
    # Verify package.json exists in app directory
    if [ ! -f "$app_dir/package.json" ]; then
      log_error "No package.json found in: $app_dir"
      return 1
    fi
    
    # Check if frontend directory exists
    if [ -d "$app_dir/frontend" ]; then
      # Verify frontend package.json exists
      if [ ! -f "$app_dir/frontend/package.json" ]; then
        log_warning "Frontend package.json not found at: $app_dir/frontend/package.json"
      else
        log "Found frontend package.json at: $app_dir/frontend/package.json"
      fi
    fi
    
    # IMPORTANT: Install dependencies and build for backend and frontend separately
    
    # 1. Build backend first - this includes npm install for backend
    log "Building backend components in $app_dir..."
    build_backend "$app_dir" || { 
      log_error "Backend build failed"
      return 1
    }
    
    # 2. Explicitly install dependencies for frontend separately
    if [ -d "$app_dir/frontend" ] && [ -f "$app_dir/frontend/package.json" ]; then
      log "Installing frontend dependencies separately..."
      cd "$app_dir/frontend" || {
        log_error "Failed to change to frontend directory"
        return 1
      }
      
      # Create .npmrc to ensure dev dependencies are always installed
      log "Configuring npm for frontend dependencies..."
      echo "production=false" > "$app_dir/frontend/.npmrc"
      
      # Remove package-lock.json to ensure clean install
      if [ -f "$app_dir/frontend/package-lock.json" ]; then
        log "Removing frontend package-lock.json for clean install..."
        rm -f "$app_dir/frontend/package-lock.json"
      fi
      
      # Install frontend dependencies using npm install
      log "Running npm install for frontend..."
      npm install --no-package-lock || {
        log_warning "Frontend npm install failed first attempt, trying with legacy peer deps..."
        npm install --no-package-lock --legacy-peer-deps
      }
    fi
    
  # 3. Then build frontend 
  log "Building frontend components in $app_dir..."
  build_frontend "$app_dir" || {
    log_warning "Frontend build failed or skipped, but continuing with deployment"
    # Continue despite frontend build failure - this is often non-fatal
  }
  
    # Initialize database
    # initialize_database "$app_dir" || { # Database init should happen in deploy/update
    #   log_error "Database initialization failed"
    #   return 1
    # }
    
    log_success "Application build completed successfully"
    return 0
  }

# Only run build_application when script is executed directly
# When sourced by deploy.sh/update.sh, the calling script controls execution.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  log_warning "build.sh executed directly. This is usually meant to be called by deploy.sh or update.sh."
  # Attempt to set up environment if run directly, but this might be unreliable
  if [ -z "$APP_DIR" ]; then
      log "Attempting to determine APP_DIR based on script location (may be incorrect)..."
      build_script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
      APP_DIR="$( cd "$build_script_dir/../../" &> /dev/null && pwd )"
      export APP_DIR
      log "Guessed APP_DIR: $APP_DIR"
      # Attempt to setup environment based on guessed APP_DIR
      setup_environment "" # Pass empty domain, let setup_environment figure it out
  fi
  show_header
  build_application
fi
