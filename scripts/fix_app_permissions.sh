#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Emergency Permission Fix Script for MCPServer/Connect
# This script fixes common permission issues that can cause authentication failures
# Usage: sudo bash fix_app_permissions.sh [APP_ROOT] [APP_USER] [APP_GROUP]

# Default values
APP_ROOT="${1:-/var/www/connect}"
APP_USER="${2:-sconnect}"
APP_GROUP="${3:-www-data}"
DB_FILE="${APP_ROOT}/data/mcp.db"

# Display banner
echo ""
echo "=============================================="
echo "  MCPServer/Connect Permission Fix Script"
echo "=============================================="
echo ""

# Check if running as root
if [ "$(id -u)" != "0" ]; then
    echo "❌ This script must be run as root or with sudo"
    exit 1
fi

echo "🔍 Checking current permissions..."
echo "  - App root: $APP_ROOT"
echo "  - App user: $APP_USER"
echo "  - App group: $APP_GROUP"

# Verify user and group exist
if ! id "$APP_USER" &>/dev/null; then
    echo "❌ User $APP_USER does not exist"
    exit 1
fi

if ! getent group "$APP_GROUP" &>/dev/null; then
    echo "❌ Group $APP_GROUP does not exist"
    exit 1
fi

# Check if directories exist
if [ ! -d "$APP_ROOT" ]; then
    echo "❌ Application root directory $APP_ROOT does not exist"
    exit 1
fi

# Create data directory if it doesn't exist
if [ ! -d "$APP_ROOT/data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p "$APP_ROOT/data"
    echo "✅ Data directory created"
fi

echo "🔧 Fixing directory ownership..."
chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"
echo "✅ Ownership set to $APP_USER:$APP_GROUP"

echo "🔧 Setting directory permissions..."
# Set base permissions (750 - rwxr-x---)
chmod -R 750 "$APP_ROOT"
echo "✅ Base permissions set (750 - rwxr-x---)"

echo "🔧 Setting data directory permissions..."
# Set data directory permissions (770 - rwxrwx---)
chmod 770 "$APP_ROOT/data"
echo "✅ Data directory permissions set (770 - rwxrwx---)"

echo "🔧 Setting SGID bit on data directory..."
# Set SGID bit to maintain group ownership
chmod g+s "$APP_ROOT/data"
echo "✅ SGID bit set on data directory"

# Fix database file permissions if it exists
if [ -f "$DB_FILE" ]; then
    echo "🔧 Setting database file permissions..."
    chown "$APP_USER:$APP_GROUP" "$DB_FILE"
    chmod 660 "$DB_FILE"
    echo "✅ Database file permissions set (660 - rw-rw----)"
else
    echo "⚠️ Database file not found at $DB_FILE (this is normal if the app hasn't been started yet)"
fi

# Fix python virtual environment directory if it exists
if [ -d "$APP_ROOT/venv" ]; then
    echo "🔧 Fixing Python virtual environment permissions..."
    chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT/venv"
    chmod -R 750 "$APP_ROOT/venv"
    echo "✅ Python virtual environment permissions fixed"
fi

# Also check for legacy python-venv directory and fix it if it exists
if [ -d "$APP_ROOT/data/python-venv" ]; then
    echo "🔧 Fixing legacy Python virtual environment permissions..."
    echo "⚠️ Note: The system now uses $APP_ROOT/venv as the standard location."
    chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT/data/python-venv"
    chmod -R 750 "$APP_ROOT/data/python-venv"
    echo "✅ Legacy Python virtual environment permissions fixed"
fi

echo ""
echo "✅ Permission fixes completed successfully!"
echo ""
echo "You should now restart your application:"
echo "1. If using PM2: pm2 restart connect"
echo "2. If using systemd: sudo systemctl restart connect"
echo ""
echo "For more information, see docs/PERMISSION_FIX.md"
echo ""
