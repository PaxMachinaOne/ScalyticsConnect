#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
if ! command_exists log; then
  MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
  source "$MODULE_DIR/utils.sh"
  source "$MODULE_DIR/env.sh"
fi

create_ecosystem_config() {
  local app_dir="${1:-$APP_DIR}"
  local app_name="${2:-${APP_NAME,,}}"
  local port="${3:-$PORT}"
  local python_venv_dir="${4:-$PYTHON_VENV_DIR}"
  
  local certifi_path_for_pm2=""
  if [ -x "$python_venv_dir/bin/python" ]; then
    certifi_path_for_pm2=$($python_venv_dir/bin/python -m certifi)
  else
    log_warning "Python interpreter not found at $python_venv_dir/bin/python. SSL_CERT_FILE for Python service might not be set correctly."
  fi
    
  if [[ "$app_dir" == "./"* ]]; then
    app_dir="$APP_HOME/$app_dir"
  fi
  
  if [ ! -d "$app_dir" ]; then
    log_error "Application directory does not exist: $app_dir"
    return 1
  fi
  
  cat > "$app_dir/ecosystem.config.js" << EOF
module.exports = {
  apps: [
    { // Node.js Backend Application
      name: '$app_name',
      script: '$app_dir/scripts/pm2-wrapper.sh', 
      cwd: '$app_dir', 
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      env_file: '.env.production', 
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 10000,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: $port, // Port for Node.js app
        PYTHON_DEEP_SEARCH_BASE_URL: 'http://localhost:8001',
        SKIP_HF_CHECK: 'true',
        PRESERVE_ADMIN_PASSWORD: 'true',
        NEVER_RESET_ADMIN_PASSWORD: 'true',
        SKIP_GROUP_CREATION: 'true',
        DB_ADMIN_PASSWORD_PROTECTED: 'true',
        CRITICAL_PASSWORD_LOCK: 'true',
        API_CORS_ORIGIN: '$API_CORS_ORIGIN',
        FRONTEND_URL: '$FRONTEND_URL',
        PYTHON_CMD: '$app_dir/scripts/python-wrapper.sh', 
        LD_LIBRARY_PATH: '/usr/local/cuda/lib64:$app_dir/bin/llama:$app_dir/bin/llama/lib:\${LD_LIBRARY_PATH}',
        PYTHON_VENV_DIR: '$python_venv_dir', 
        PATH: '/usr/local/cuda-12.6/bin:/usr/local/bin:/usr/bin:/bin:$app_dir/bin:$app_dir/scripts:$python_venv_dir/bin:\${PATH}'
      }
    },
    { // Python FastAPI Deep Search Service
      name: '${app_name}-deep-search-svc',
      script: '$python_venv_dir/bin/python', 
      args: '-m uvicorn src.python_services.deep_search_service.main:app --host 127.0.0.1 --port 8001 --workers 1 --log-level info --timeout-keep-alive 600', 
      cwd: '$app_dir', 
      instances: 1,
      autorestart: true,
      watch: false, 
      max_memory_restart: '8G', 
      env_file: '.env.production', 
      kill_timeout: 3000,
      env: {
        PYTHONPATH: '$app_dir', 
        PYTHON_DEEP_SEARCH_SCRAPE_CONCURRENCY: 4,
        ${certifi_path_for_pm2:+SSL_CERT_FILE: "'$certifi_path_for_pm2',"}
      }
    }
  ]
};
EOF
  
  log_success "PM2 ecosystem configuration created in $app_dir/ecosystem.config.js"
  return 0
}

configure_pm2() {
  log "Configuring PM2 process manager..."
  
  if ! command_exists pm2; then
    log "PM2 not found, installing globally..."
    npm install -g pm2
  fi
  
  create_ecosystem_config "$APP_DIR" "${APP_NAME,,}" "$PORT" "$PYTHON_VENV_DIR" || {
    log_error "Failed to create ecosystem configuration"
    return 1
  }
  
  if pm2 list | grep -q "${APP_NAME,,}"; then
    log "Application is already running with PM2, reloading configuration..."
    pm2 delete "${APP_NAME,,}" || log_warning "Failed to delete existing process, continuing anyway"
  fi
  
  log "Starting application with PM2..."
  cd "$APP_DIR" && pm2 start ecosystem.config.js
  
  log "Saving PM2 process list..."
  pm2 save || log_warning "Failed to save PM2 process list"
  
  log "Setting up PM2 to start on system boot..."
  
  log_success "PM2 configuration completed"
  return 0
}

configure_pm2_for_user() {
  local target_user="$1"
  local app_dir="${2:-$APP_DIR}"
  local app_name="${3:-${APP_NAME,,}}"
  
  if [ -z "$target_user" ]; then
    log_error "No target user specified for PM2 configuration"
    return 1
  fi
  
  log "Configuring PM2 for user: $target_user"
  
  if ! id "$target_user" &>/dev/null; then
    log_error "User $target_user does not exist"
    return 1
  fi
  
  local user_home=$(eval echo ~$target_user)
  local user_python_venv_dir="$app_dir/venv"
  log "Using app directory Python path for better reliability: $user_python_venv_dir"
  create_ecosystem_config "$app_dir" "$app_name" "$PORT" "$user_python_venv_dir" || {
    log_error "Failed to create ecosystem configuration"
    return 1
  }
  
  chown "$target_user:$(id -gn "$target_user")" "$app_dir/ecosystem.config.js"
  
  if ! su - "$target_user" -c "command -v pm2" >/dev/null 2>&1; then
   log "Creating PM2 symlinks for $target_user..."
    mkdir -p "$user_home/bin"
    
    PM2_PATH=$(which pm2 2>/dev/null)
    if [ -n "$PM2_PATH" ]; then
      ln -sf "$PM2_PATH" "$user_home/bin/pm2"
      chown -R "$target_user:$(id -gn "$target_user")" "$user_home/bin"
    else
      log "Installing PM2 globally..."
      npm install -g pm2
      PM2_PATH=$(which pm2 2>/dev/null)
      if [ -n "$PM2_PATH" ]; then
        ln -sf "$PM2_PATH" "$user_home/bin/pm2"
        chown -R "$target_user:$(id -gn "$target_user")" "$user_home/bin"
      fi
    fi
  fi
  
  if [ ! -d "$user_home/.pm2" ]; then
    mkdir -p "$user_home/.pm2"
    chown -R "$target_user:$(id -gn "$target_user")" "$user_home/.pm2"
  fi
  
  log "Starting PM2 application..."
  su - "$target_user" -c "
    cd \"$app_dir\"
    
    if [ -f \"\$HOME/node_modules/.bin/pm2\" ]; then
      PM2_BIN=\"\$HOME/node_modules/.bin/pm2\"
    elif [ -f \"\$HOME/bin/pm2\" ]; then
      PM2_BIN=\"\$HOME/bin/pm2\"
    elif command -v pm2 >/dev/null 2>&1; then
      PM2_BIN=\"pm2\"
    else
      echo 'ERROR: PM2 not found in PATH or common locations'
      exit 1
    fi
    
    echo "Attempting to stop and delete existing PM2 process: $app_name..."
    \$PM2_BIN stop \"$app_name\" --silent 2>/dev/null || true
    \$PM2_BIN delete \"$app_name\" 2>/dev/null || true
    
    local python_svc_name=\"${app_name}-deep-search-svc\"
    echo "Attempting to stop and delete existing PM2 process: \$python_svc_name..."
    \$PM2_BIN stop \"\$python_svc_name\" --silent 2>/dev/null || true
    \$PM2_BIN delete \"\$python_svc_name\" 2>/dev/null || true
    
    sleep 2

    echo "Starting main application services..."
    \$PM2_BIN start \"$app_dir/ecosystem.config.js\"
    
    \$PM2_BIN save
  "
  
  log "Setting up PM2 to start on system boot for $target_user..."
  
  if command -v pm2 >/dev/null 2>&1; then
    log "Attempting to remove existing PM2 startup config for $target_user..."
    if [ -f "/usr/bin/pm2" ]; then
      PM2_UNSTARTUP_PATH="/usr/bin/pm2"
    else
      PM2_UNSTARTUP_PATH=$(which pm2)
    fi
    if [ -d "$app_dir" ] && [ "$(stat -c '%U' "$app_dir")" = "$target_user" ]; then
      UNSTARTUP_HOME_PATH="$app_dir"
    else
      UNSTARTUP_HOME_PATH="$user_home"
    fi
    
    sudo env PATH=$PATH:/usr/bin "$PM2_UNSTARTUP_PATH" unstartup systemd -u "$target_user" --hp "$UNSTARTUP_HOME_PATH" >/dev/null 2>&1 || true
    log "Existing startup config removed or was not present."

    if [ -f "/usr/bin/pm2" ]; then
      PM2_PATH="/usr/bin/pm2"
    else
      PM2_PATH=$(which pm2)
    fi
    
    if [ -d "$app_dir" ] && [ "$(stat -c '%U' "$app_dir")" = "$target_user" ]; then
      HOME_PATH="$app_dir"
    else
      HOME_PATH="$user_home"
    fi
    
    log "Creating PM2 startup for systemd with user: $target_user"
    PM2_SETUP_COMMAND_GENERATOR="sudo env PATH=\$PATH:/usr/bin $PM2_PATH startup systemd -u $target_user --hp $HOME_PATH --service-name ${app_name}-pm2"
    log "Generating PM2 startup system command with: $PM2_SETUP_COMMAND_GENERATOR"
    GENERATED_OUTPUT_FROM_PM2=$($PM2_SETUP_COMMAND_GENERATOR)
    log "Full output from PM2 startup command generator: $GENERATED_OUTPUT_FROM_PM2"
    
    COMMAND_TO_EXECUTE=""

    if echo "$GENERATED_OUTPUT_FROM_PM2" | grep -q "\[PM2\] \[-\] Executing:"; then
        COMMAND_TO_EXECUTE=$(echo "$GENERATED_OUTPUT_FROM_PM2" | grep "\[PM2\] \[-\] Executing:" | sed -n 's/.*\[PM2\] \[-\] Executing: \(.*\)\.\.\.$/\1/p' | head -n 1)
    fi

    if [ -z "$COMMAND_TO_EXECUTE" ]; then
        if echo "$GENERATED_OUTPUT_FROM_PM2" | grep -q "Execute the following command:"; then
            COMMAND_TO_EXECUTE=$(echo "$GENERATED_OUTPUT_FROM_PM2" | awk '/Execute the following command:/ {getline; print}' | grep -oE '(sudo )?systemctl enable [^[:space:]]+' | head -n 1)
        fi
    fi
    
    if [ -z "$COMMAND_TO_EXECUTE" ]; then
        COMMAND_TO_EXECUTE=$(echo "$GENERATED_OUTPUT_FROM_PM2" | grep -oE '(sudo )?systemctl enable [^[:space:]]+' | head -n 1)
    fi

    if [ -n "$COMMAND_TO_EXECUTE" ]; then
        log "Identified command to execute for PM2 startup: $COMMAND_TO_EXECUTE"
        sh -c "$COMMAND_TO_EXECUTE"
        if [ $? -eq 0 ]; then
            log_success "PM2 system startup command executed successfully: $COMMAND_TO_EXECUTE"
        else
            log_error "Execution of PM2 system startup command FAILED: $COMMAND_TO_EXECUTE. PM2 may not start on boot."
            # return 1
        fi
    elif echo "$GENERATED_OUTPUT_FROM_PM2" | grep -qE "already setup|already init|command successfully executed"; then
        log_success "PM2 startup indicates already configured or successful."
        log_debug "Full PM2 output for reference: $GENERATED_OUTPUT_FROM_PM2"
    else
        log_warning "Could not identify a 'systemctl enable' command from PM2 startup output, and no clear success/already-setup message found."
        log_warning "PM2 might not start on boot. Manual setup may be required."
    fi
    
    log "Ensuring PM2 process list is saved for user $target_user..."
    su - "$target_user" -c "
      cd \"$app_dir\";
      PM2_EXEC_PATH=\$(command -v pm2);
      if [ -z \"\$PM2_EXEC_PATH\" ] && [ -f \"\$HOME/bin/pm2\" ]; then PM2_EXEC_PATH=\"\$HOME/bin/pm2\"; fi;
      if [ -z \"\$PM2_EXEC_PATH\" ] && [ -f \"\$HOME/node_modules/.bin/pm2\" ]; then PM2_EXEC_PATH=\"\$HOME/node_modules/.bin/pm2\"; fi;
      if [ -z \"\$PM2_EXEC_PATH\" ]; then echo 'ERROR: pm2 executable not found for user $target_user during save.'; exit 1; fi;
      echo 'Saving current PM2 process list...';
      \$PM2_EXEC_PATH save;
    "
    if [ $? -eq 0 ]; then
        log_success "PM2 process list saved successfully for $target_user."
    else
        log_warning "Failed to save PM2 process list for $target_user. Applications may not resurrect correctly on boot."
    fi
  fi
  
  log_success "PM2 configuration for user $target_user completed."
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  show_header
  setup_environment
  configure_pm2 "$@"
fi
