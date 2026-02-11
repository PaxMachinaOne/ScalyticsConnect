#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# WMCP - Model Context Protocol Setup Script
# This script will create the directory structure, initialize the database, and install dependencies

set -e # Exit on error

echo "======================================================================================"
echo "  WMCP - Model Context Protocol Server Setup"
echo "======================================================================================"
echo

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v14 or higher)."
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version 14 or higher is required. You have version $NODE_VERSION."
    exit 1
fi

echo "✅ Node.js version $(node -v) detected"
echo "✅ npm version $(npm -v) detected"
echo

echo "📁 Creating directory structure..."

# Create the directory structure
mkdir -p src/{config,controllers,middleware,models,routes,services,utils}
mkdir -p data
mkdir -p test/{unit,integration}
mkdir -p models

echo "📄 Creating package.json..."

# Create package.json
cat > package.json << 'EOF'
{
  "name": "wmcp-server",
  "version": "1.0.0",
  "description": "Model Context Protocol (MCP) Chatbot Backend",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest",
    "lint": "eslint .",
    "setup": "node setup/init-db.js"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "bcrypt": "^5.1.1",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "morgan": "^1.10.0",
    "sqlite3": "^5.1.6",
    "uuid": "^9.0.1",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "eslint": "^8.56.0",
    "jest": "^29.7.0",
    "nodemon": "^3.0.2",
    "supertest": "^6.3.3"
  },
  "engines": {
    "node": ">=14.0.0"
  },
  "private": true
}
EOF

echo "📄 Creating .env file..."

# Create .env file
cat > .env << 'EOF'
# Server Configuration
PORT=3000
NODE_ENV=development

# Security
JWT_SECRET=change_this_to_a_secure_random_string
JWT_EXPIRE=30d
ENCRYPTION_SECRET=change_this_to_a_secure_32_char_string

# Database
DB_PATH=./data/mcp.db

# Models Directory
MODELS_DIR=./models

# Logging
LOG_LEVEL=info

# External APIs (optional system-wide keys)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
COHERE_API_KEY=
MISTRAL_API_KEY=

# Privacy Settings
ALLOW_EXTERNAL_IN_PRIVATE=false
EOF

echo "📄 Creating .gitignore..."

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependency directories
node_modules/
jspm_packages/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Database files
data/*.db
data/*.sqlite
data/*.sqlite3

# Model files
models/*
!models/.gitkeep

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Directory for instrumented libs
lib-cov

# Coverage directory
coverage

# Documentation
docs

# Editors
.idea/
.vscode/
*.swp
*.swo
.DS_Store
EOF

echo "📄 Creating schema.sql..."

# Create the database schema file
cat > schema.sql << 'EOF'
-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Models Table
CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    model_path TEXT NOT NULL,
    context_window INTEGER DEFAULT 4096,
    is_active BOOLEAN DEFAULT 1,
    external_provider_id INTEGER,
    external_model_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (external_provider_id) REFERENCES api_providers (id)
);

-- Chats Table
CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    default_model_id INTEGER,
    private_mode BOOLEAN DEFAULT 0,
    theme TEXT DEFAULT 'light',
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (default_model_id) REFERENCES models (id) ON DELETE SET NULL
);

-- Model Contexts
CREATE TABLE IF NOT EXISTS model_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    is_default BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
);

-- User Access Logs (for admin statistics)
CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Usage Statistics
CREATE TABLE IF NOT EXISTS usage_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    model_id INTEGER NOT NULL,
    chat_id INTEGER,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);

-- API Key Providers Table
CREATE TABLE IF NOT EXISTS api_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    api_url TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User API Keys Table
CREATE TABLE IF NOT EXISTS user_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider_id INTEGER NOT NULL,
    api_key TEXT NOT NULL,
    is_valid BOOLEAN DEFAULT 1,
    last_checked TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE
);

-- Insert default admin user if not exists
INSERT OR IGNORE INTO users (username, email, password, is_admin)
VALUES ('admin', 'admin@mcp.local', '$2b$10$mLCHSLb7VaLAGuRVxfh5UuCfnPD0sOjc0TU586dTvOu91s5XMVt1i', 1);
-- Default password is 'admin123' (hashed with bcrypt)

-- Insert default providers if not exists
INSERT OR IGNORE INTO api_providers (name, description, api_url) 
VALUES 
('OpenAI', 'OpenAI API for ChatGPT, GPT-4, and other models', 'https://api.openai.com'),
('Anthropic', 'Anthropic API for Claude models', 'https://api.anthropic.com'),
('Cohere', 'Cohere API for Command models', 'https://api.cohere.ai'),
('Mistral', 'Mistral API for Mistral models', 'https://api.mistral.ai');
EOF

echo "📄 Creating init-db.js..."

# Create setup directory and initialization script
mkdir -p setup
cat > setup/init-db.js << 'EOF'
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Database file path
const DB_PATH = path.join(dataDir, 'mcp.db');

// Create database connection
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to the MCP SQLite database');
});

// Read and execute the schema SQL
const schemaPath = path.join(__dirname, '../schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');

db.exec(schemaSql, (err) => {
  if (err) {
    console.error('❌ Error initializing database:', err.message);
    db.close();
    process.exit(1);
  }
  
  console.log('✅ Database schema initialized successfully');
  
  console.log('✅ Setup complete!');
  console.log('');
  console.log('📝 Default admin credentials:');
  console.log('   Username: admin');
  console.log('   Password: admin123');
  console.log('');
  console.log('⚠️  Important: Change the default admin password after first login!');
  console.log('');
  console.log('🚀 Start the server with: npm start');
  
  db.close();
});
EOF

echo "📄 Creating README.md..."

# Create README.md
cat > README.md << 'EOF'
# WMCP Server

WMCP (World Model Context Protocol) is a backend server for a local, offline-capable chatbot system with model management, user authentication, and admin statistics.

## Features

- **Offline Operation**: Works without internet connection in private mode
- **SQLite Database**: Lightweight embedded database for local storage
- **User Authentication**: Secure login and registration system
- **Model Management**: Add and manage different AI models locally
- **External API Integration**: Support for OpenAI, Anthropic, Cohere, and Mistral APIs
- **User API Keys**: Users can add their own API keys for external services
- **Admin Interface**: View statistics and manage users/models
- **Chat History**: Store and retrieve conversation history
- **Private Mode**: Enhanced privacy with local-only processing

## Quick Start

1. Make sure you have Node.js (v14+) installed
2. Run `npm install` to install dependencies
3. Run `npm run setup` to initialize the database
4. Run `npm start` to start the server
5. Access the API at http://localhost:3000

## Default Admin Account

Username: `admin`  
Password: `admin123`

**Important**: Change the default admin password immediately after the first login.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/settings` - Update user settings

### API Keys
- `GET /api/apikeys/providers` - Get all available API providers
- `GET /api/apikeys/keys` - Get user's API keys
- `POST /api/apikeys/keys` - Add a new API key
- `DELETE /api/apikeys/keys/:id` - Delete an API key

### Chat
- `GET /api/chat` - Get all user chats
- `POST /api/chat` - Create a new chat
- `GET /api/chat/:id` - Get a single chat with messages
- `PUT /api/chat/:id` - Update chat title
- `DELETE /api/chat/:id` - Delete a chat
- `POST /api/chat/:id/messages` - Send a message and get response

### Models
- `GET /api/models` - Get all available models
- `GET /api/models/:id` - Get single model details
- `POST /api/models` - Add new model (admin only)
- `PUT /api/models/:id` - Update model (admin only)
- `DELETE /api/models/:id` - Delete model (admin only)
- `GET /api/models/:id/contexts` - Get model contexts
- `POST /api/models/:id/contexts` - Add model context (admin only)

### Admin
- `GET /api/admin/stats` - Get system overview statistics
- `GET /api/admin/users` - Get all users
- `GET /api/admin/users/:id` - Get single user with usage stats
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `GET /api/admin/models/:id/stats` - Get model usage statistics
- `GET /api/admin/usage` - Get usage statistics over time
- `GET /api/admin/logs` - Get system logs

## Adding Models

### Local Models
1. Add model files to the `models/` directory.
2. Use the admin interface or API to register the model.
3. The system supports any model that can be loaded locally.

### External API Models
1. Log in to the admin interface.
2. Add a new model with the external provider specified.
3. Users can use their own API keys or system-wide keys can be configured in the `.env` file.

## License

This project is licensed under the MIT License.
EOF

echo "📄 Creating placeholder file in models directory..."
touch models/.gitkeep

echo "📦 Installing dependencies..."

# Install dependencies
npm install

echo "🔧 Initializing database..."

# Run database initialization
mkdir -p data
node setup/init-db.js

echo "======================================================================================"
echo "  🎉 WMCP Server setup complete!"
echo "======================================================================================"
echo
echo "📂 The server is set up in: $(pwd)"
echo 
echo "🏁 To start the server, run:"
echo "  cd $(pwd)"
echo "  npm start"
echo
echo "🔗 The server will be available at: http://localhost:3000"
echo 
echo "💻 Default admin credentials:"
echo "  Username: admin"
echo "  Password: admin123"
echo
echo "⚠️  IMPORTANT: Change the default admin password after the first login!"
echo "======================================================================================"
