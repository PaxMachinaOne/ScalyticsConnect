#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Connect Deployment Bootstrap Script
# This script sets up the initial server environment for a new deployment

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Important: We use SCRIPT_DIR for the top-level directory
# but each module now uses MODULE_DIR internally to avoid path duplication
source "$SCRIPT_DIR/../modules/utils.sh"
source "$SCRIPT_DIR/../modules/env.sh"
source "$SCRIPT_DIR/../modules/node.sh"
source "$SCRIPT_DIR/../modules/python.sh"
source "$SCRIPT_DIR/../modules/fix_permissions.sh"

show_header

APP_USER="${APP_USER:-}"
APP_HOME="${APP_HOME:-}"
APP_GRP="${APP_GRP:-www-data}"

setup_app_directories() {
  log "Setting up application directories..."
  local current_user=$(whoami)
  log "Current user: $current_user"
  log "Creating directories in $APP_HOME..."
  mkdir -p "$APP_HOME/bin" "$APP_HOME/lib"
  if [ "$(id -u)" != "0" ] && ! groups | grep -q "$APP_GRP"; then
    log "Adding current user to $APP_GRP group..."
    run_with_sudo usermod -aG "$APP_GRP" "$APP_USER"
  fi
  if [ "$(id -u)" = "0" ]; then
    log "Setting ownership of $APP_HOME directories..."
    chown -R "$APP_USER:$APP_USER" "$APP_HOME/bin" "$APP_HOME/lib"
    chmod -R 750 "$APP_HOME/bin" "$APP_HOME/lib"
  fi
  log_success "Application directories set up successfully"
  return 0
}

install_system_deps() {
  log "Installing system dependencies..."
  local lock_file="/var/lock/connect-apt.lock"
  if [ -f "$lock_file" ]; then
    local lock_pid=$(cat "$lock_file")
    if ps -p "$lock_pid" > /dev/null; then
      log_warning "Another process (PID: $lock_pid) is already using apt. Waiting..."
      while [ -f "$lock_file" ] && ps -p "$lock_pid" > /dev/null; do sleep 5; done
    else
      log_warning "Stale lock file found. Removing it."
      run_with_sudo rm -f "$lock_file"
    fi
  fi
  echo $$ | run_with_sudo tee "$lock_file" > /dev/null
  
  log "Updating package lists..."
  run_with_sudo apt-get update
  
  log "Adding Node.js 20.x repository..."
  curl -sL https://deb.nodesource.com/setup_20.x | run_with_sudo -E bash -

  log "Installing core packages..."
  run_with_sudo apt-get install -y \
    git curl build-essential nginx certbot python3-certbot-nginx \
    python3 python3-pip python3-venv python3-dev \
    sqlite3 libsqlite3-dev libssl-dev wget unzip \
    plocate gcc python3-pip libxml2-dev libxslt1-dev zlib1g-dev g++ \
    gcc-12 g++-12 nodejs

  run_with_sudo rm -f "$lock_file"
  log_success "System dependencies installed"
  return 0
}

check_gpu_drivers() {
  log "Checking for GPU hardware and drivers..."
  local nvidia_detected=false
  local amd_detected=false

  # Check for NVIDIA GPU
  if lspci | grep -iq "NVIDIA"; then
    log "NVIDIA GPU detected."
    nvidia_detected=true
    if ! command_exists nvidia-smi; then
      log_error "NVIDIA GPU detected, but 'nvidia-smi' command not found."
      log_error "Please install the appropriate NVIDIA drivers before proceeding."
      return 1
    else
      log_success "NVIDIA drivers appear to be installed ('nvidia-smi' found)."
    fi
  fi

  # Check for AMD GPU
  if lspci | grep -iq "AMD"; then
    log "AMD GPU detected."
    amd_detected=true
    if ! lsmod | grep -q "amdgpu"; then
      log_error "AMD GPU detected, but 'amdgpu' kernel module is not loaded."
      log_error "Please install the appropriate AMD drivers before proceeding."
      return 1
    else
      log_success "AMD drivers appear to be installed ('amdgpu' module loaded)."
    fi
  fi

  if ! $nvidia_detected && ! $amd_detected; then
    log_warning "No NVIDIA or AMD GPU detected. Assuming CPU-only or unsupported GPU."
  fi

  log_success "GPU driver check passed."
  return 0
}

configure_server() {
  log "Configuring server for production use..."
  if command_exists ufw; then
    log "Configuring firewall..."
    run_with_sudo ufw allow ssh; run_with_sudo ufw allow http; run_with_sudo ufw allow https
    if ! run_with_sudo ufw status | grep -q "Status: active"; then echo "y" | run_with_sudo ufw enable; fi
    log_success "Firewall configured"
  else log_warning "UFW not installed, skipping firewall configuration"; fi
  if [ -f "/etc/ssh/sshd_config" ]; then
    log "Configuring SSH for better security..."
    run_with_sudo cp "/etc/ssh/sshd_config" "/etc/ssh/sshd_config.backup-$(date +%Y%m%d%H%M%S)"
    run_with_sudo bash -c "sed -i 's/^#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config"
    run_with_sudo bash -c "sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config"
    run_with_sudo systemctl restart sshd
    log_success "SSH security enhanced"
  else log_warning "SSH config not found, skipping SSH security configuration"; fi
  log_success "Server configuration completed"
  return 0
}

main() {
  log "Starting Connect bootstrap process..."
  if [ "$(id -u)" != "0" ]; then log_error "This script must be run as root or with sudo"; exit 1; fi
  if [ -n "$SUDO_USER" ]; then log_warning "Running as sudo from user: $SUDO_USER"; SUDO_CONTEXT=true; else SUDO_CONTEXT=false; fi
  
  install_system_deps || { log_error "Failed to install system dependencies"; exit 1; }
  
  check_gpu_drivers || { log_error "GPU driver check failed. Aborting."; exit 1; }

  log "Configuring GCC alternatives..."
  run_with_sudo update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-12 12
  run_with_sudo update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-12 12
  run_with_sudo update-alternatives --set gcc /usr/bin/gcc-12
  run_with_sudo update-alternatives --set g++ /usr/bin/g++-12
  log_success "GCC alternatives configured."

  # User and group setup
  log "Creating 'sconnect' user and groups..."
  if id "sconnect" &>/dev/null; then
    log_warning "User 'sconnect' already exists. Skipping creation."
  else
    run_with_sudo adduser sconnect
  fi
  run_with_sudo usermod -aG sudo sconnect
  run_with_sudo usermod -aG www-data sconnect
  log_success "User 'sconnect' configured."
  log_warning "For passwordless sudo, manually run 'sudo visudo' and add:"
  log_warning "'%sudo   ALL=(ALL:ALL) NOPASSWD:ALL'"

  APP_USER="sconnect"
  setup_environment

  log "Creating application directories..."
  run_with_sudo mkdir -p /var/www/connect
  run_with_sudo chown -R sconnect:www-data /var/www/connect
  run_with_sudo chmod 775 /var/www/connect
  log_success "Application directory /var/www/connect created."

  configure_server || { log_error "Failed to configure server"; exit 1; }

  log "Setting up Python for $APP_USER..."
  log "Setting up Python for $APP_USER..."
  setup_python_for_user "$APP_USER" "$PYTHON_VERSION" || { log_error "Failed to set up Python"; exit 1; }
  
  log_success "Bootstrap process completed successfully!"
  log ""
  log "Bootstrap complete. Next steps:"
  log "1. Switch to the 'sconnect' user: sudo su - sconnect"
  log "2. Unzip the release package."
  log "3. Run the deployment script: sudo ./deploy/release-deploy.sh -u <your_instance_uri>"
  return 0
}

main "$@"
