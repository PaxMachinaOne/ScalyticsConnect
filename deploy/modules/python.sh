#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Python virtual environment setup module
# Adapted from deployment/modules/python.sh

# Source utils and env modules if not already sourced
# Don't call command_exists directly as it's defined in utils.sh
MODULE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if ! command -v log &>/dev/null; then
  source "$MODULE_DIR/utils.sh"
  source "$MODULE_DIR/env.sh"
fi

# Install Python with SSL support using virtualenv
install_python() {
  # Keeping it for potential legacy calls but logging a warning
  log_warning "Legacy install_python function called. Please use setup_python_for_user."
  setup_python_for_user "$APP_USER" "$1" # Call the new function
}

# Set up Python virtual environment for a specific user
setup_python_for_user() {
  local target_user="$1"
  local python_version="${2:-$PYTHON_VERSION}"
  local app_tmp_dir="$APP_DIR/tmp"
  run_with_sudo mkdir -p "$app_tmp_dir"
  run_with_sudo chown -R "$APP_USER:$APP_GRP" "$app_tmp_dir"
  run_with_sudo chmod 755 "$app_tmp_dir"

  if [ -z "$target_user" ]; then
    log_error "No target user specified for Python setup"
    return 1
  fi

  log "Setting up Python virtual environment for user: $target_user"

  # Ensure user exists
  if ! id "$target_user" &>/dev/null; then
    log_error "User $target_user does not exist"
    return 1
  fi

  # Get user's home directory
  local user_home=$(eval echo ~$target_user)
  log "User home directory: $user_home"

  # Check for production environment - always use a path under APP_DIR for better reliability
  if [[ "$target_user" == "sconnect" ]] && [[ "$APP_DIR" == "/var/www/connect" ]]; then
    # Always create virtual environment in the app directory, not in user's home
    local venv_dir="$APP_DIR/venv"
    log "Production environment detected. Using app directory path for virtual environment: $venv_dir"
  else
    # Use standard virtual environment path
    local venv_dir="${PYTHON_VENV_DIR:-$APP_DIR/venv}"
    log "Using standard virtual environment path: $venv_dir"
  fi

  # Update the global variable for other scripts
  PYTHON_VENV_DIR="$venv_dir"

  # Ensure parent directory permissions are correct BEFORE checking/creating venv
  local parent_dir="$(dirname "$venv_dir")"
  log "Ensuring correct permissions for parent directory: $parent_dir"
  run_with_sudo mkdir -p "$parent_dir"
  # Set ownership explicitly to sconnect:www-data
  run_with_sudo chown "sconnect:www-data" "$parent_dir"
  # Set permissions: User=rwx, Group=rwx (needed for venv creation), Other=rx
  # Add setgid bit (2) so files/dirs created within inherit the group 'www-data'
  run_with_sudo chmod 2775 "$parent_dir"
  log "Permissions set for $parent_dir"

  # Make sure Python 3 and pip are installed system-wide first
  if ! command_exists python3; then
    log_error "Python3 is not installed. Please install Python first."
    return 1
  fi
  if ! command_exists pip3; then
    log "Installing pip3 system-wide..."
    run_with_sudo apt-get update
    run_with_sudo apt-get install -y python3-pip
  fi
  # Install virtualenv for the system
  if ! command_exists virtualenv; then
    log "Installing virtualenv for the system..."
    if command_exists apt-get; then
      run_with_sudo apt-get install -y python3-virtualenv || \
      run_with_sudo python3 -m pip install --root-user-action=ignore virtualenv
    elif command_exists yum; then
      run_with_sudo yum install -y python3-virtualenv || \
      run_with_sudo python3 -m pip install --root-user-action=ignore virtualenv
    else
      run_with_sudo python3 -m pip install --root-user-action=ignore virtualenv
    fi
  fi

  # Force Python virtual environment rebuild for this update to ensure clean state.
  log_warning "Forcing Python virtual environment rebuild for this update to ensure a consistently clean state."
  if [ -d "$venv_dir" ]; then
    log "Removing existing venv at $venv_dir prior to rebuild."
    run_with_sudo rm -rf "$venv_dir"
  fi

  # Check if a virtual environment already exists and is functional
  # Given the above rm -rf, this block is unlikely to find a functional venv,
  # leading to venv_functional remaining false and triggering a rebuild.
  local venv_functional=false
  if [ -d "$venv_dir" ] && [ -f "$venv_dir/bin/python" ]; then
    log "Found existing virtual environment, checking if it's functional..."
    # Test if Python interpreter works AND pip module is importable
    local venv_check_cmd="cd \"$APP_DIR\" && \"$venv_dir/bin/python\" -c 'import sys; import pip; print(\"Virtual environment is functional\")'"
    if run_as_user "$target_user" bash -c "$venv_check_cmd" &>/dev/null; then
      log_success "Existing virtual environment is working properly (Python & pip OK)"
      log "Preserving existing virtual environment to maintain compiled extensions"
      venv_functional=true
      log "Upgrading core packages..."
      run_as_user "$target_user" bash -c "cd \"$APP_DIR\" && \"$venv_dir/bin/python\" -m pip install --upgrade pip setuptools wheel"
      run_with_sudo chown -R "$target_user:$APP_GRP" "$venv_dir"
    else
      log_warning "Existing virtual environment is not functional (pip check failed), will need to recreate it"
      run_with_sudo rm -rf "$venv_dir"
    fi
  elif [ -d "$venv_dir" ]; then
    log_warning "Virtual environment directory exists but is missing Python executable, will recreate"
    run_with_sudo rm -rf "$venv_dir"
  else
    log "No existing virtual environment found, will create a new one"
  fi

  # Create venv if it wasn't functional or didn't exist
  if [ "$venv_functional" = false ]; then
      log "Creating Python virtual environment in $venv_dir..."

      # Create a two-phase bootstrap approach for completely isolated environment
      log "Creating fully isolated virtual environment using bootstrap method..."

      # Phase 1: Create minimal virtual environment without pip - *MUST* run as APP_USER
      log "Attempting venv creation as user '$APP_USER' in '$venv_dir'..."
      if ! run_as_user "$APP_USER" python3 -m venv --clear --without-pip "$venv_dir"; then
          log_error "Failed to create virtual environment as user '$APP_USER'. Check permissions on $(dirname "$venv_dir")"
          # Attempt creation with sudo as a fallback, then fix ownership immediately
          log "Attempting venv creation with sudo as fallback..."
          if run_with_sudo python3 -m venv --clear --without-pip "$venv_dir"; then
              log "Fallback venv creation successful. Fixing ownership..."
              run_with_sudo chown -R "$APP_USER:$APP_GRP" "$venv_dir"
          else
              log_error "Fallback venv creation with sudo also failed."
              return 1
          fi
      fi

      # Verify creation was successful and ownership is correct
      if [ ! -d "$venv_dir" ]; then
        log_error "Virtual environment directory '$venv_dir' not found after creation attempt."
        return 1
      fi
      # Double-check and force ownership after creation, regardless of method
      log "Ensuring correct ownership for '$venv_dir' ($APP_USER:$APP_GRP)..."
      run_with_sudo chown -R "$APP_USER:$APP_GRP" "$venv_dir"
      run_with_sudo chmod -R u+rwX,g+rX,o-rwx "$venv_dir" # Ensure user has full control, group read/execute

      # Ensure proper isolation settings
      if [ -f "$venv_dir/pyvenv.cfg" ]; then
        log "Setting up virtual environment configuration..."
        # Create a temporary file with the desired configuration
        local temp_cfg=$(mktemp)
        echo "home = $(dirname $(dirname $(which python3)))" > "$temp_cfg"
        echo "include-system-site-packages = false" >> "$temp_cfg"
        echo "version = $(python3 --version | cut -d' ' -f2)" >> "$temp_cfg"
        # Copy with correct ownership
        run_with_sudo cp "$temp_cfg" "$venv_dir/pyvenv.cfg"
        run_with_sudo chown "$target_user:$APP_GRP" "$venv_dir/pyvenv.cfg"
        # Clean up temporary file
        rm -f "$temp_cfg"

        # Phase 2: Bootstrap pip using get-pip.py
        log "Bootstrapping pip inside virtual environment..."
        # Download get-pip.py to the temporary directory
        local get_pip_script="$app_tmp_dir/get-pip.py"
        log "Downloading get-pip.py..."
        # Create a wget/curl wrapper script with proper permissions
        local download_script="$app_tmp_dir/download_get_pip.sh"
        cat > "$download_script" << DOWNSCRIPT
#!/bin/bash
if command -v wget &> /dev/null; then
  wget -q https://bootstrap.pypa.io/get-pip.py -O "$get_pip_script"
elif command -v curl &> /dev/null; then
  curl -s https://bootstrap.pypa.io/get-pip.py -o "$get_pip_script"
else
  echo "Neither wget nor curl is available. Cannot download get-pip.py"
  exit 1
fi
DOWNSCRIPT
        # Ensure permissions are correct before executing
        run_with_sudo chmod 755 "$download_script"
        run_with_sudo chown "$target_user:$APP_GRP" "$download_script"
        # Download get-pip.py
        run_as_user "$target_user" "$download_script"
        # Verify download was successful
        if [ ! -f "$get_pip_script" ]; then
          log_error "Failed to download get-pip.py"
          return 1
        fi
        # Create bootstrap script for pip installation
        local bootstrap_script="$app_tmp_dir/bootstrap_pip.sh"
        cat > "$bootstrap_script" << BOOT
#!/bin/bash
export PYTHONNOUSERSITE=1
export PIP_USER=0
export PIP_REQUIRE_VIRTUALENV=0
export PIP_NO_USER_CONFIG=1
unset PYTHONPATH
unset PYTHONHOME
mkdir -p "$venv_dir/pip"
cat > "$venv_dir/pip/pip.conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
export PIP_CONFIG_FILE="$venv_dir/pip/pip.conf"
"$venv_dir/bin/python" "$get_pip_script" --no-user --isolated --no-cache-dir --disable-pip-version-check
if [ ! -f "$venv_dir/bin/pip" ]; then echo "ERROR: pip installation failed"; exit 1; fi
"$venv_dir/bin/python" -m pip install --upgrade --no-user --isolated --no-cache-dir --disable-pip-version-check pip setuptools wheel
BOOT
        # Ensure permissions are correct
        run_with_sudo chmod 755 "$bootstrap_script"
        run_with_sudo chown "$target_user:$APP_GRP" "$bootstrap_script"
        # Execute bootstrap script
        local pip_install_result=0
        run_as_user "$target_user" "$bootstrap_script" || pip_install_result=$?
        # Verify pip installation
        if [ $pip_install_result -ne 0 ] || [ ! -f "$venv_dir/bin/pip" ]; then
          log_error "Pip installation failed. Check permissions and connectivity."
          return 1
        fi
        
        # Upgrade pip, setuptools, and wheel
        log "Upgrading pip, setuptools, and wheel..."
        local upgrade_script="$app_tmp_dir/upgrade_pip.sh"
        cat > "$upgrade_script" << UPGRADE_SCRIPT
#!/bin/bash
export PYTHONNOUSERSITE=1
"$venv_dir/bin/python" -m pip install --upgrade pip setuptools wheel
UPGRADE_SCRIPT
        run_with_sudo chmod +x "$upgrade_script"
        run_with_sudo chown "$target_user:$APP_GRP" "$upgrade_script"
        run_as_user "$target_user" "$upgrade_script"
        if [ $? -ne 0 ]; then log_warning "Failed to upgrade pip, setuptools, or wheel."; fi
        run_with_sudo rm -f "$upgrade_script"
        
        # Clean up
        run_with_sudo rm -f "$bootstrap_script" "$get_pip_script" "$download_script"
        log_success "Pip bootstrapped and core packages upgraded successfully in isolated environment"
      else
        log_warning "pyvenv.cfg not found, using default configuration"
      fi

      # Verify python and pip were created
      if [ ! -f "$venv_dir/bin/python" ]; then log_error "Python executable not found in virtual environment"; return 1; fi
      if [ ! -f "$venv_dir/bin/pip" ] && [ ! -f "$venv_dir/bin/pip3" ]; then log_error "Pip not found in virtual environment"; return 1; fi

      # Install basic requirements after creating venv
      log "Installing basic Python packages..."
      local temp_script="$app_tmp_dir/install_basic_packages.sh"
      cat > "$temp_script" << EOSCRIPT
#!/bin/bash
export PYTHONIOENCODING=utf-8
export PIP_USER=0
export PIP_REQUIRE_VIRTUALENV=0
export PIP_NO_USER_CONFIG=1
mkdir -p "$venv_dir/pip"
cat > "$venv_dir/pip/pip.conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
export PIP_CONFIG_FILE="$venv_dir/pip/pip.conf"
export PYTHONNOUSERSITE=1
PYTHON_PATH="$venv_dir/bin/python"
if [ ! -f "\$PYTHON_PATH" ]; then echo "ERROR: python not found at \$PYTHON_PATH"; exit 1; fi
"\$PYTHON_PATH" -m pip install --no-user --isolated --no-cache-dir --no-input --disable-pip-version-check pip
"\$PYTHON_PATH" -m pip install --no-user --isolated --no-cache-dir --no-input --disable-pip-version-check --ignore-installed numpy requests tqdm huggingface_hub
exit 0
EOSCRIPT
      run_with_sudo chmod +x "$temp_script"
      run_with_sudo chown "$APP_USER:$APP_GRP" "$temp_script"
      run_as_user "$target_user" "$temp_script"
      if [ $? -ne 0 ]; then log_warning "Problem installing basic packages."; fi
      run_with_sudo rm -f "$temp_script"

      # Install requirements.txt after creating venv
      if [ -f "$APP_DIR/scripts/requirements.txt" ]; then
        log "Installing requirements from $APP_DIR/scripts/requirements.txt..."
        local req_script="$app_tmp_dir/install_requirements.sh"
        cat > "$req_script" << REQSCRIPT
#!/bin/bash
export PYTHONIOENCODING=utf-8
export PIP_USER=0
export PIP_REQUIRE_VIRTUALENV=0
export PIP_NO_USER_CONFIG=1
mkdir -p "$venv_dir/pip"
cat > "$venv_dir/pip/pip.conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
export PIP_CONFIG_FILE="$venv_dir/pip/pip.conf"
export PYTHONNOUSERSITE=1
PYTHON_PATH="$venv_dir/bin/python"
if [ ! -f "\$PYTHON_PATH" ]; then echo "ERROR: python not found at \$PYTHON_PATH"; exit 1; fi

# The numpy/setuptools repair is likely unnecessary on a clean venv and may contribute to slowness.
# Removing it to streamline the process.

echo "Upgrading pip to the latest version..."
"\$PYTHON_PATH" -m pip install --upgrade pip
if [ \$? -ne 0 ]; then
    echo "WARNING: Failed to upgrade pip. Continuing with existing version."
fi

echo "Installing requirements from requirements.txt with user-friendly progress..."
# Use a quieter output format but still show progress
"\$PYTHON_PATH" -m pip install --prefer-binary --upgrade -r "$APP_DIR/scripts/requirements.txt"
PIP_EXIT_CODE=\$?

if [ \$PIP_EXIT_CODE -ne 0 ]; then
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!!! ERROR: pip install from requirements.txt failed with exit code \$PIP_EXIT_CODE"
    echo "!!! See the error output above for details."
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    # Exit the script with the pip error code to halt the deployment if requirements fail
    exit \$PIP_EXIT_CODE
fi

echo "--- Pip install finished successfully at \$(date) ---"
exit 0
REQSCRIPT
        run_with_sudo chmod +x "$req_script"
        run_with_sudo chown "$APP_USER:$APP_GRP" "$req_script"
        run_as_user "$APP_USER" "$req_script"
        run_with_sudo rm -f "$req_script"
        log_success "Application requirements installed"

        # --- Install Playwright browsers ---
        log "Installing Playwright browser dependencies from within the virtual environment..."
        local playwright_script="$app_tmp_dir/install_playwright.sh"
        cat > "$playwright_script" << PW_SCRIPT
#!/bin/bash
# Activate the correct venv first
if [ -f "$venv_dir/bin/activate" ]; then
    source "$venv_dir/bin/activate"
else
    echo "ERROR: Activation script not found at $venv_dir/bin/activate"
    exit 1
fi

# Export encoding to avoid Unicode issues
export PYTHONIOENCODING=utf-8

echo "Installing Playwright browsers and dependencies..."
python -m playwright install --with-deps

if [ \$? -ne 0 ]; then
  echo "WARNING: Playwright browser installation failed."
fi
exit 0
PW_SCRIPT
        run_with_sudo chmod +x "$playwright_script"
        run_with_sudo chown "$APP_USER:$APP_GRP" "$playwright_script"
        run_as_user "$APP_USER" "$playwright_script"
        run_with_sudo rm -f "$playwright_script"
        log_success "Playwright browser installation step completed."
        # --- End Playwright browsers ---

        # --- Download spaCy models ---
        log "Downloading required spaCy models (after scripts/requirements.txt)..."
        local spacy_script="$app_tmp_dir/download_spacy_models.sh"
        cat > "$spacy_script" << SPACYSCRIPT
#!/bin/bash
export PYTHONIOENCODING=utf-8
export PIP_USER=0
export PIP_REQUIRE_VIRTUALENV=0
export PIP_NO_USER_CONFIG=1
mkdir -p "$venv_dir/pip"
cat > "$venv_dir/pip/pip.conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
export PIP_CONFIG_FILE="$venv_dir/pip/pip.conf"
export PYTHONNOUSERSITE=1
PYTHON_PATH="$venv_dir/bin/python"
if [ ! -f "\$PYTHON_PATH" ]; then echo "ERROR: python not found at \$PYTHON_PATH"; exit 1; fi

echo "Downloading en_core_web_sm..."
"\$PYTHON_PATH" -m spacy download en_core_web_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download en_core_web_sm"; fi

echo "Downloading de_core_news_sm..."
"\$PYTHON_PATH" -m spacy download de_core_news_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download de_core_news_sm"; fi

echo "Downloading fr_core_news_sm..." # Added French
"\$PYTHON_PATH" -m spacy download fr_core_news_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download fr_core_news_sm"; fi

echo "Downloading es_core_news_sm..." # Added Spanish
"\$PYTHON_PATH" -m spacy download es_core_news_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download es_core_news_sm"; fi

exit 0
SPACYSCRIPT
        run_with_sudo chmod +x "$spacy_script"
        run_with_sudo chown "$APP_USER:$APP_GRP" "$spacy_script"
        run_as_user "$APP_USER" "$spacy_script"
        run_with_sudo rm -f "$spacy_script"
        log_success "spaCy model download process completed."
        # --- End spaCy model download ---

      elif [ -f "$APP_DIR/requirements.txt" ]; then
         log "Installing requirements from $APP_DIR/requirements.txt..."
         # Similar logic as above for root requirements.txt
         local req_script="$app_tmp_dir/install_requirements.sh"
         cat > "$req_script" << REQSCRIPT
#!/bin/bash
export PYTHONIOENCODING=utf-8
export PIP_USER=0
export PIP_REQUIRE_VIRTUALENV=0
export PIP_NO_USER_CONFIG=1
mkdir -p "$venv_dir/pip"
cat > "$venv_dir/pip/pip.conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
export PIP_CONFIG_FILE="$venv_dir/pip/pip.conf"
export PYTHONNOUSERSITE=1
PYTHON_PATH="$venv_dir/bin/python"
if [ ! -f "\$PYTHON_PATH" ]; then echo "ERROR: python not found at \$PYTHON_PATH"; exit 1; fi

# Attempt to fix potentially corrupted numpy and setuptools (also for root requirements.txt case)
echo "Attempting to repair numpy and setuptools installations based on recent error logs (root requirements context)..."
"\$PYTHON_PATH" -m pip install --force-reinstall --no-deps numpy==2.2.5
"\$PYTHON_PATH" -m pip install --force-reinstall --no-deps setuptools==80.0.0
echo "Repair attempt for numpy and setuptools completed (root requirements context)."

"\$PYTHON_PATH" -m pip install --no-user --isolated --no-cache-dir --no-input --disable-pip-version-check --ignore-installed -r "$APP_DIR/requirements.txt"
exit 0
REQSCRIPT
         run_with_sudo chmod +x "$req_script"
         run_with_sudo chown "$APP_USER:$APP_GRP" "$req_script"
         run_as_user "$APP_USER" "$req_script"
         run_with_sudo rm -f "$req_script"
         log_success "Application requirements installed"

         # --- Download spaCy models (also after root requirements.txt) ---
         log "Downloading required spaCy models..."
         local spacy_script_root="$app_tmp_dir/download_spacy_models_root.sh"
         cat > "$spacy_script_root" << SPACYSCRIPTROOT
#!/bin/bash
export PYTHONIOENCODING=utf-8
export PIP_USER=0
export PIP_REQUIRE_VIRTUALENV=0
export PIP_NO_USER_CONFIG=1
mkdir -p "$venv_dir/pip"
cat > "$venv_dir/pip/pip.conf" << PIPCONF
[global]
user = false
isolated = true
no-cache-dir = true
disable-pip-version-check = true
PIPCONF
export PIP_CONFIG_FILE="$venv_dir/pip/pip.conf"
export PYTHONNOUSERSITE=1
PYTHON_PATH="$venv_dir/bin/python"
if [ ! -f "\$PYTHON_PATH" ]; then echo "ERROR: python not found at \$PYTHON_PATH"; exit 1; fi

echo "Downloading en_core_web_sm..."
"\$PYTHON_PATH" -m spacy download en_core_web_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download en_core_web_sm"; fi

echo "Downloading de_core_news_sm..."
"\$PYTHON_PATH" -m spacy download de_core_news_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download de_core_news_sm"; fi

echo "Downloading fr_core_news_sm..." # Added French
"\$PYTHON_PATH" -m spacy download fr_core_news_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download fr_core_news_sm"; fi

echo "Downloading es_core_news_sm..." # Added Spanish
"\$PYTHON_PATH" -m spacy download es_core_news_sm
if [ \$? -ne 0 ]; then echo "WARNING: Failed to download es_core_news_sm"; fi

exit 0
SPACYSCRIPTROOT
         run_with_sudo chmod +x "$spacy_script_root"
         run_with_sudo chown "$APP_USER:$APP_GRP" "$spacy_script_root"
         run_as_user "$APP_USER" "$spacy_script_root"
         run_with_sudo rm -f "$spacy_script_root"
         log_success "spaCy model download process completed."
         # --- End spaCy model download ---

      else
        log_warning "No requirements.txt found"
      fi
  fi # End of venv recreation block

  # Clean up temporary directory if it exists
  if [ -d "$app_tmp_dir" ]; then
    rmdir "$app_tmp_dir" 2>/dev/null || true
  fi

  # Add environment variables to .connect-env
  set_env_var "PYTHON_VENV_DIR" "$venv_dir"
  set_env_var "PYTHON_ACTIVATE_CMD" "source $venv_dir/bin/activate"

  log_success "Python virtual environment setup completed successfully"
  log ""
  log "Python environment is ready at: $venv_dir"
  log "Python wrappers are available in: $app_bin_dir"
  log ""

  return 0
}

# Only run when script is executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  show_header
  setup_environment
  install_python "$@"
fi
