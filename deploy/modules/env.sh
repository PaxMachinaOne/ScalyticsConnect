#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Environment configuration for deployment system

# Source utils module if not already sourced
if ! command_exists log; then
  MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
  source "$MODULE_DIR/utils.sh"
fi

# Set up environment variables and paths
# Accepts an optional domain argument to override detection/defaults
setup_environment() {
  local arg_domain="$1" # Optional domain override from argument
  log "Setting up environment variables..."
  
  # Determine script and deployment directories only if not already set
  if [ -z "$DEPLOY_DIR" ]; then
    DEPLOY_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
  fi
  log "Deployment scripts directory: $DEPLOY_DIR" # Clarified log message

  # Default configuration with ability to override
  APP_NAME="${APP_NAME:-Connect}"
  REPO_NAME="${REPO_NAME:-MCPServer}"
  
  # Determine current user and their home directory
  # If we're running as sudo, use the user who called sudo
  if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER="$SUDO_USER"
  else
    ACTUAL_USER="$(whoami)"
  fi
  
  # Set APP_USER if not already set
  APP_USER="${APP_USER:-$ACTUAL_USER}"
  
  # Determine home directory for the actual user (supports sudo)
  if [ -n "$SUDO_USER" ]; then
    USER_HOME="$(eval echo ~$SUDO_USER)"
  else
    USER_HOME="$HOME"
  fi
  
  # Set APP_HOME to user's home by default (no hardcoded paths)
  APP_HOME="${APP_HOME:-$USER_HOME}"
  # Define APP_DIR early as it's needed for reading existing .env
  APP_DIR="${APP_DIR:-/var/www/$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]')}"  # lowercase for directory name
  REPO_DIR="${REPO_DIR:-$USER_HOME/$REPO_NAME}"
  SUBDIR="${SUBDIR:-Connect}"

  # --- Determine Domain ---
  local domain_to_use=""

  # Priority 1: Use domain passed as argument (e.g., from deploy.sh -u or update.sh -u)
  if [ -n "$arg_domain" ]; then
      domain_to_use="$arg_domain"
      log "Using domain from function argument: $domain_to_use"
  else
      # Priority 2: Try reading from existing .env file in deployment dir
      # Need APP_DIR defined first
      local temp_app_dir="${APP_DIR:-/var/www/$(echo "${APP_NAME:-Connect}" | tr '[:upper:]' '[:lower:]')}"
      # Check production file first, then base .env
      local deployed_env_file="$temp_app_dir/.env.production" 
      if [ ! -f "$deployed_env_file" ]; then
          deployed_env_file="$temp_app_dir/.env"
      fi

      if [ -f "$deployed_env_file" ]; then
          log "Attempting to read domain from existing file: $deployed_env_file"
          # Prioritize FRONTEND_URL, then API_CORS_ORIGIN
          local url_from_env=$(grep -E '^(FRONTEND_URL|API_CORS_ORIGIN)=' "$deployed_env_file" | head -n 1 | cut -d '=' -f 2- | sed 's/"//g')
          if [ -n "$url_from_env" ]; then
              local domain_from_env=$(echo "$url_from_env" | sed -e 's|^[^/]*//||' -e 's|/.*$||')
              if [ -n "$domain_from_env" ]; then
                  domain_to_use="$domain_from_env"
                  log "Using domain from existing env file ($deployed_env_file): $domain_to_use"
              fi
          fi
      fi

      # Priority 3: Fallback to default if still not set
      if [ -z "$domain_to_use" ]; then
          domain_to_use="${DOMAIN:-connect.scalytics.io}" # Use existing DOMAIN env var or default
          log "Using default or existing DOMAIN env var: $domain_to_use"
      fi
  fi
  DOMAIN="$domain_to_use" # Set the final DOMAIN variable
  # --- End Determine Domain ---

  # --- Set Full URIs based on DOMAIN ---
  # Assume HTTPS for production URLs
  INSTANCE_URI="https://${DOMAIN}"
  API_CORS_ORIGIN="$INSTANCE_URI"
  FRONTEND_URL="$INSTANCE_URI"
  log "Derived Instance URI: $INSTANCE_URI"
  # --- End Set Full URIs ---

  PORT="${PORT:-3000}"
  NODE_VERSION="${NODE_VERSION:-18.18.0}"
  PYTHON_VERSION="${PYTHON_VERSION:-3.10}"
  # Use user's home directory for log file to avoid permission issues
  LOG_FILE="${LOG_FILE:-$HOME/tmp/${APP_USER}-deploy-log.txt}"
  
  # Set up Python virtual environment path with fallback locations
  # First, check if a user-specific venv path for production should be used
  if [ -d "/home/sconnect/python-venvs/connect-venv" ]; then
    # Use the production user's home directory path
    PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-/home/sconnect/python-venvs/connect-venv}"
  elif [ -d "$HOME/python-venvs/connect-venv" ]; then
    # Fallback to current user's home directory
    PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-$HOME/python-venvs/connect-venv}"
  else
    # Default to standard app path, creating it if needed
    PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-$APP_DIR/venv}"
  fi
  
  # NodeJS should be installed system-wide
  
  # Create logs directory if doesn't exist
  ensure_dir "$(dirname "$LOG_FILE")"
  touch "$LOG_FILE"
  
  # Set up CUDA environment if available
  setup_cuda_environment
  
  # Log configuration details
  log "App name: $APP_NAME"
  log "Repository name: $REPO_NAME"
  log "App user: $APP_USER"
  log "App home: $APP_HOME"
  log "App directory: $APP_DIR"
  log "Repository directory: $REPO_DIR"
  log "Domain: $DOMAIN"
  log "Port: $PORT"
  log "Node.js version: $NODE_VERSION"
  log "Python version: $PYTHON_VERSION"
  log "Log file: $LOG_FILE"
  log "Python venv directory: $PYTHON_VENV_DIR"
  
  # In production deployment, environment variables are stored in APP_DIR/.env.production
  # During script execution, we use in-memory environment variables only
  
  # Export all environment variables so they are available to child processes
  export APP_NAME
  export REPO_NAME
  export APP_USER
  export APP_HOME
  export APP_DIR
  export REPO_DIR
  export SUBDIR
  # export DOMAIN # Let the calling script manage the scope if needed
  export PORT
  export NODE_VERSION
  export PYTHON_VERSION
  export LOG_FILE
  export PYTHON_VENV_DIR
  export DEPLOY_DIR
  export DOMAIN # Keep exporting domain too
  export INSTANCE_URI # Export the full URI
  export API_CORS_ORIGIN # Export the CORS origin
  export FRONTEND_URL # Export the Frontend URL
  
  # Export CUDA environment variables if detected
  if [ -n "$CUDA_HOME" ]; then
    export CUDA_HOME
    export CUDA_PATH="$CUDA_HOME"  # Some applications use this instead
  fi
  
  # Only create temporary env file if explicitly requested and not in git repo
  if [ "${SAVE_ENV_TO_FILE:-false}" = "true" ] && [ -n "$TEMP_ENV_FILE" ]; then
    # Ensure we're not writing to the repository
    if [[ "$TEMP_ENV_FILE" == *".git"* ]] || [[ "$TEMP_ENV_FILE" == "$DEPLOY_DIR"* ]]; then
      log_warning "Refusing to write environment file to git repository location"
    else
      log "Saving temporary environment to $TEMP_ENV_FILE"
      ensure_dir "$(dirname "$TEMP_ENV_FILE")"
      # Write to temp file (not in git repo)
      echo "# Temporary deployment environment - $(date)" > "$TEMP_ENV_FILE"
      echo "APP_NAME=\"$APP_NAME\"" >> "$TEMP_ENV_FILE"
      echo "REPO_NAME=\"$REPO_NAME\"" >> "$TEMP_ENV_FILE"
      echo "APP_USER=\"$APP_USER\"" >> "$TEMP_ENV_FILE"
      echo "APP_HOME=\"$APP_HOME\"" >> "$TEMP_ENV_FILE"
      echo "APP_DIR=\"$APP_DIR\"" >> "$TEMP_ENV_FILE"
      echo "REPO_DIR=\"$REPO_DIR\"" >> "$TEMP_ENV_FILE"
      echo "SUBDIR=\"$SUBDIR\"" >> "$TEMP_ENV_FILE"
      echo "DOMAIN=\"$DOMAIN\"" >> "$TEMP_ENV_FILE"
      echo "PORT=\"$PORT\"" >> "$TEMP_ENV_FILE"
      echo "NODE_VERSION=\"$NODE_VERSION\"" >> "$TEMP_ENV_FILE"
      echo "PYTHON_VERSION=\"$PYTHON_VERSION\"" >> "$TEMP_ENV_FILE"
      echo "LOG_FILE=\"$LOG_FILE\"" >> "$TEMP_ENV_FILE"
      echo "PYTHON_VENV_DIR=\"$PYTHON_VENV_DIR\"" >> "$TEMP_ENV_FILE"
      echo "DEPLOY_DIR=\"$DEPLOY_DIR\"" >> "$TEMP_ENV_FILE"
      
      # Save CUDA environment variables if detected
      if [ -n "$CUDA_HOME" ]; then
        echo "CUDA_HOME=\"$CUDA_HOME\"" >> "$TEMP_ENV_FILE"
        echo "CUDA_PATH=\"$CUDA_HOME\"" >> "$TEMP_ENV_FILE"
      fi
    fi
  fi
  
  log_success "Environment setup completed"
  return 0
}

# Function to read saved environment variables
read_environment() {
  local env_file="${1:-$APP_DIR/.env.production}"
  
  log "Reading environment from $env_file"
  
  # Check if file is in repository path and warn
  if [[ "$env_file" == "$DEPLOY_DIR/.connect-env" ]]; then
    log_warning "Deprecated: .connect-env file in repository should not be used"
    log "Using in-memory environment variables instead"
    return 0
  fi
  
  if [ ! -f "$env_file" ]; then
    log_warning "Environment file not found: $env_file"
    return 1
  fi
  
  # Source the environment file
  source "$env_file"
  
  log_success "Environment loaded from $env_file"
  return 0
}

# Function to initialize .env file with production settings
# Arg 1: target_dir
# Arg 2: instance_uri (mandatory)
init_env_file() {
  local target_dir="$1"
  local instance_uri="$2"
  log "WARN: init_env_file called with target_dir=[$target_dir], instance_uri=[$instance_uri]" # WARN
  
  if [ -z "$target_dir" ] || [ -z "$instance_uri" ]; then
    log_error "init_env_file requires target directory and instance URI arguments." # Updated error message
    return 1
  fi
  
  log "Initializing .env.production file in $target_dir" # Corrected log message
  
  if [ ! -d "$target_dir" ]; then
    log_error "Target directory does not exist: $target_dir"
    return 1
  fi
  
  local final_env_path="$target_dir/.env.production" # Define target path

  # Check if .env.production file already exists
  if [ -f "$final_env_path" ]; then
    log "Existing .env.production file found, creating backup"
    # Backup .env.production, not .env
    cp "$final_env_path" "$target_dir/.env.production.backup-$(date +%Y%m%d%H%M%S)" 
  fi
  
  # Always generate the .env file dynamically using variables
  # Generate random secrets before creating the file
  log "Generating secure random keys"
  JWT_SECRET_VALUE=$(openssl rand -hex 32)
    ENCRYPTION_SECRET_VALUE=$(openssl rand -hex 32)
    SECRET_KEY_VALUE=$(openssl rand -hex 32)
    
    # Create a basic .env file in a temporary location first
    local temp_env_file=$(mktemp)
    log "Creating new .env.production content in temporary file: $temp_env_file"
    cat > "$temp_env_file" << EOF
# Automatically generated by Connect deployment system
# $(date)
PORT=$PORT
NODE_ENV=production
JWT_SECRET=$JWT_SECRET_VALUE
JWT_EXPIRE=24h
ENCRYPTION_SECRET=$ENCRYPTION_SECRET_VALUE
DB_PATH=./data/$(echo "$APP_NAME" | tr '[:upper:]' '[:lower:]').db
MODELS_DIR=./models
LOG_LEVEL=info
ALLOW_EXTERNAL_IN_PRIVATE=false
SECRET_KEY=$SECRET_KEY_VALUE
SKIP_HF_CHECK=true
PRESERVE_ADMIN_PASSWORD=true
NEVER_RESET_ADMIN_PASSWORD=true
SKIP_GROUP_CREATION=true

# Instance-specific URLs set via -u flag
API_CORS_ORIGIN=${instance_uri}
FRONTEND_URL=${instance_uri}

# Python environment settings
PYTHON_VENV_DIR=$PYTHON_VENV_DIR
LD_LIBRARY_PATH=$APP_DIR/bin/llama:\${LD_LIBRARY_PATH}

# Set default GPU acceleration parameters if detected
GGML_CUDA=1
CUDA_VISIBLE_DEVICES=0
GGML_CUDA_FORCE=1
LLAMA_DEFAULT_GPU_LAYERS=-1
EOF

  # Move the temporary file to the final destination with sudo
  log "Moving temporary file to final destination: $final_env_path"
  run_with_sudo mv "$temp_env_file" "$final_env_path"
  local mv_exit_code=$? # Capture exit code immediately
  if [ $mv_exit_code -eq 0 ]; then
      # Set proper permissions
      run_with_sudo chmod 640 "$final_env_path"
      run_with_sudo chown "$APP_USER:$APP_GRP" "$final_env_path" # Ensure ownership
      log_success ".env.production file initialized in $target_dir"
  else
      log_error "Failed to move temporary env file to $final_env_path (Exit code: $mv_exit_code)"
      # Clean up temp file on failure
      rm -f "$temp_env_file"
      return 1
  fi
  return 0
}

# Function to initialize frontend .env.production file
# Arg 1: target_dir (base app dir, '/frontend' will be appended)
# Arg 2: instance_uri (mandatory)
init_frontend_env() {
  local base_target_dir="$1"
  local instance_uri="$2"
  local target_dir="$base_target_dir/frontend"
  log "WARN: init_frontend_env called with base_target_dir=[$base_target_dir], instance_uri=[$instance_uri]" # WARN
  
  if [ -z "$base_target_dir" ] || [ -z "$instance_uri" ]; then
     log_error "init_frontend_env requires target directory and instance URI arguments."
     (return 1 2>/dev/null) && return 1 || exit 1
  fi

  if [ ! -d "$target_dir" ]; then
    # Attempt to create frontend directory if it doesn't exist
    log_warning "Frontend directory not found: $target_dir. Attempting to create."
    run_with_sudo mkdir -p "$target_dir"
    run_with_sudo chown "$APP_USER:$APP_GRP" "$target_dir"
    if [ ! -d "$target_dir" ]; then
        log_error "Failed to create frontend directory: $target_dir"
        return 1
    fi
  fi
  
  log "Initializing frontend .env.production file"
  
  # Use the URI passed as argument
  local api_url_base="$instance_uri"
  log "Using instance_uri argument for frontend API URL base: $api_url_base"
  log "WARN: Value set in init_frontend_env: REACT_APP_API_URL=[${api_url_base}/api]" # WARN

  # Create .env.production content in a temporary file
  local temp_frontend_env=$(mktemp)
  log "Creating frontend .env.production content in temporary file: $temp_frontend_env"
  cat > "$temp_frontend_env" << EOF
# Automatically generated by Connect deployment system
# $(date)
REACT_APP_API_URL=${api_url_base}/api
EOF

  # Move the temporary file to the final destination with sudo
  local final_frontend_env_path="$target_dir/.env.production"
  log "Moving temporary file to final destination: $final_frontend_env_path"
  run_with_sudo mv "$temp_frontend_env" "$final_frontend_env_path"
  local mv_frontend_exit_code=$? # Capture exit code immediately
  if [ $mv_frontend_exit_code -eq 0 ]; then
      # Set proper permissions if needed (usually readable by app user)
      run_with_sudo chmod 644 "$final_frontend_env_path" # Allow read for owner/group
      run_with_sudo chown "$APP_USER:$APP_GRP" "$final_frontend_env_path" # Set ownership
      log_success "Frontend .env.production file initialized"
  else
      log_error "Failed to move temporary frontend env file to $final_frontend_env_path (Exit code: $mv_frontend_exit_code)"
      # Clean up temp file on failure
      rm -f "$temp_frontend_env"
      return 1
  fi
  return 0
}

# Run the function if the script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  show_header
  setup_environment "$@"
fi
