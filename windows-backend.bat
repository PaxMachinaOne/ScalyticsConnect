@echo off
rem WMCP - Model Context Protocol Setup Script for Windows
rem This script will create the directory structure, initialize the database, and install dependencies

echo ======================================================================================
echo   WMCP - Model Context Protocol Server Setup
echo ======================================================================================
echo.

rem Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo X Node.js is not installed. Please install Node.js (v14 or higher).
    exit /b 1
)

rem Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo X npm is not installed. Please install npm.
    exit /b 1
)

for /f "tokens=1,2,3 delims=." %%a in ('node -v') do (
    set NODE_VERSION=%%a
)
set NODE_VERSION=%NODE_VERSION:~1%
if %NODE_VERSION% LSS 14 (
    echo X Node.js version 14 or higher is required. You have version %NODE_VERSION%.
    exit /b 1
)

echo ✓ Node.js version detected
node -v
echo ✓ npm version detected
npm -v
echo.

rem Create the project directory if it doesn't exist
if "%1"=="" (
    set PROJECT_DIR=WMCP
) else (
    set PROJECT_DIR=%1
)

if exist %PROJECT_DIR% (
    echo i Directory '%PROJECT_DIR%' already exists.
    set /p CONTINUE=Continue and potentially overwrite existing files? (y/n): 
    if /i not "%CONTINUE%"=="y" (
        echo Setup canceled.
        exit /b 1
    )
) else (
    mkdir %PROJECT_DIR%
)
cd %PROJECT_DIR%

echo Creating directory structure...

rem Create the directory structure
mkdir src\config src\controllers src\middleware src\models src\routes src\services src\utils
mkdir data
mkdir test\unit test\integration
mkdir models

echo Creating package.json...

rem Create package.json
echo {> package.json
echo   "name": "wmcp-server",>> package.json
echo   "version": "1.0.0",>> package.json
echo   "description": "Model Context Protocol (MCP) Chatbot Backend",>> package.json
echo   "main": "server.js",>> package.json
echo   "scripts": {>> package.json
echo     "start": "node server.js",>> package.json
echo     "dev": "nodemon server.js",>> package.json
echo     "test": "jest",>> package.json
echo     "lint": "eslint .",>> package.json
echo     "setup": "node setup/init-db.js">> package.json
echo   },>> package.json
echo   "dependencies": {>> package.json
echo     "axios": "^1.6.2",>> package.json
echo     "bcrypt": "^5.1.1",>> package.json
echo     "cors": "^2.8.5",>> package.json
echo     "dotenv": "^16.3.1",>> package.json
echo     "express": "^4.18.2",>> package.json
echo     "express-rate-limit": "^7.1.5",>> package.json
echo     "helmet": "^7.1.0",>> package.json
echo     "jsonwebtoken": "^9.0.2",>> package.json
echo     "morgan": "^1.10.0",>> package.json
echo     "sqlite3": "^5.1.6",>> package.json
echo     "uuid": "^9.0.1",>> package.json
echo     "winston": "^3.11.0">> package.json
echo   },>> package.json
echo   "devDependencies": {>> package.json
echo     "eslint": "^8.56.0",>> package.json
echo     "jest": "^29.7.0",>> package.json
echo     "nodemon": "^3.0.2",>> package.json
echo     "supertest": "^6.3.3">> package.json
echo   },>> package.json
echo   "engines": {>> package.json
echo     "node": ">=14.0.0">> package.json
echo   },>> package.json
echo   "private": true>> package.json
echo }>> package.json

echo Creating .env file...

rem Create .env file
echo # Server Configuration> .env
echo PORT=3000>> .env
echo NODE_ENV=development>> .env
echo.>> .env
echo # Security>> .env
echo JWT_SECRET=change_this_to_a_secure_random_string>> .env
echo JWT_EXPIRE=30d>> .env
echo ENCRYPTION_SECRET=change_this_to_a_secure_32_char_string>> .env
echo.>> .env
echo # Database>> .env
echo DB_PATH=./data/mcp.db>> .env
echo.>> .env
echo # Models Directory>> .env
echo MODELS_DIR=./models>> .env
echo.>> .env
echo # Logging>> .env
echo LOG_LEVEL=info>> .env
echo.>> .env
echo # External APIs (optional system-wide keys)>> .env
echo OPENAI_API_KEY=>> .env
echo ANTHROPIC_API_KEY=>> .env
echo COHERE_API_KEY=>> .env
echo MISTRAL_API_KEY=>> .env
echo.>> .env
echo # Privacy Settings>> .env
echo ALLOW_EXTERNAL_IN_PRIVATE=false>> .env

echo Creating .gitignore...

rem Create .gitignore
echo # Dependency directories> .gitignore
echo node_modules/>> .gitignore
echo jspm_packages/>> .gitignore
echo.>> .gitignore
echo # Environment variables>> .gitignore
echo .env>> .gitignore
echo .env.local>> .gitignore
echo .env.development.local>> .gitignore
echo .env.test.local>> .gitignore
echo .env.production.local>> .gitignore
echo.>> .gitignore
echo # Database files>> .gitignore
echo data/*.db>> .gitignore
echo data/*.sqlite>> .gitignore
echo data/*.sqlite3>> .gitignore
echo.>> .gitignore
echo # Model files>> .gitignore
echo models/*>> .gitignore
echo !models/.gitkeep>> .gitignore
echo.>> .gitignore
echo # Logs>> .gitignore
echo logs>> .gitignore
echo *.log>> .gitignore
echo npm-debug.log*>> .gitignore
echo yarn-debug.log*>> .gitignore
echo yarn-error.log*>> .gitignore
echo.>> .gitignore
echo # Runtime data>> .gitignore
echo pids>> .gitignore
echo *.pid>> .gitignore
echo *.seed>> .gitignore
echo *.pid.lock>> .gitignore
echo.>> .gitignore
echo # Directory for instrumented libs>> .gitignore
echo lib-cov>> .gitignore
echo.>> .gitignore
echo # Coverage directory>> .gitignore
echo coverage>> .gitignore
echo.>> .gitignore
echo # Documentation>> .gitignore
echo docs>> .gitignore
echo.>> .gitignore
echo # Editors>> .gitignore
echo .idea/>> .gitignore
echo .vscode/>> .gitignore
echo *.swp>> .gitignore
echo *.swo>> .gitignore
echo .DS_Store>> .gitignore

echo Creating schema.sql...

rem Create the database schema file
echo -- Users Table> schema.sql
echo CREATE TABLE IF NOT EXISTS users (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     username TEXT NOT NULL UNIQUE,>> schema.sql
echo     email TEXT NOT NULL UNIQUE,>> schema.sql
echo     password TEXT NOT NULL,>> schema.sql
echo     is_admin BOOLEAN DEFAULT 0,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- Models Table>> schema.sql
echo CREATE TABLE IF NOT EXISTS models (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     name TEXT NOT NULL UNIQUE,>> schema.sql
echo     description TEXT,>> schema.sql
echo     model_path TEXT NOT NULL,>> schema.sql
echo     context_window INTEGER DEFAULT 4096,>> schema.sql
echo     is_active BOOLEAN DEFAULT 1,>> schema.sql
echo     external_provider_id INTEGER,>> schema.sql
echo     external_model_id TEXT,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (external_provider_id) REFERENCES api_providers (id)>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- Chats Table>> schema.sql
echo CREATE TABLE IF NOT EXISTS chats (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     user_id INTEGER NOT NULL,>> schema.sql
echo     model_id INTEGER NOT NULL,>> schema.sql
echo     title TEXT DEFAULT 'New Chat',>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,>> schema.sql
echo     FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- Messages Table>> schema.sql
echo CREATE TABLE IF NOT EXISTS messages (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     chat_id INTEGER NOT NULL,>> schema.sql
echo     role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),>> schema.sql
echo     content TEXT NOT NULL,>> schema.sql
echo     tokens INTEGER DEFAULT 0,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- User Settings>> schema.sql
echo CREATE TABLE IF NOT EXISTS user_settings (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     user_id INTEGER NOT NULL UNIQUE,>> schema.sql
echo     default_model_id INTEGER,>> schema.sql
echo     private_mode BOOLEAN DEFAULT 0,>> schema.sql
echo     theme TEXT DEFAULT 'light',>> schema.sql
echo     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,>> schema.sql
echo     FOREIGN KEY (default_model_id) REFERENCES models (id) ON DELETE SET NULL>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- Model Contexts>> schema.sql
echo CREATE TABLE IF NOT EXISTS model_contexts (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     model_id INTEGER NOT NULL,>> schema.sql
echo     name TEXT NOT NULL,>> schema.sql
echo     content TEXT NOT NULL,>> schema.sql
echo     is_default BOOLEAN DEFAULT 0,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- User Access Logs (for admin statistics)>> schema.sql
echo CREATE TABLE IF NOT EXISTS access_logs (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     user_id INTEGER NOT NULL,>> schema.sql
echo     action TEXT NOT NULL,>> schema.sql
echo     details TEXT,>> schema.sql
echo     ip_address TEXT,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- Usage Statistics>> schema.sql
echo CREATE TABLE IF NOT EXISTS usage_statistics (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     user_id INTEGER NOT NULL,>> schema.sql
echo     model_id INTEGER NOT NULL,>> schema.sql
echo     chat_id INTEGER,>> schema.sql
echo     tokens_input INTEGER DEFAULT 0,>> schema.sql
echo     tokens_output INTEGER DEFAULT 0,>> schema.sql
echo     latency_ms INTEGER,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,>> schema.sql
echo     FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,>> schema.sql
echo     FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- API Key Providers Table>> schema.sql
echo CREATE TABLE IF NOT EXISTS api_providers (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     name TEXT NOT NULL UNIQUE,>> schema.sql
echo     description TEXT,>> schema.sql
echo     api_url TEXT,>> schema.sql
echo     is_active BOOLEAN DEFAULT 1,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- User API Keys Table>> schema.sql
echo CREATE TABLE IF NOT EXISTS user_api_keys (>> schema.sql
echo     id INTEGER PRIMARY KEY AUTOINCREMENT,>> schema.sql
echo     user_id INTEGER NOT NULL,>> schema.sql
echo     provider_id INTEGER NOT NULL,>> schema.sql
echo     api_key TEXT NOT NULL,>> schema.sql
echo     is_valid BOOLEAN DEFAULT 1,>> schema.sql
echo     last_checked TIMESTAMP,>> schema.sql
echo     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,>> schema.sql
echo     FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,>> schema.sql
echo     FOREIGN KEY (provider_id) REFERENCES api_providers (id) ON DELETE CASCADE>> schema.sql
echo );>> schema.sql
echo.>> schema.sql
echo -- Insert default admin user if not exists>> schema.sql
echo INSERT OR IGNORE INTO users (username, email, password, is_admin)>> schema.sql
echo VALUES ('admin', 'admin@mcp.local', '$2b$10$mLCHSLb7VaLAGuRVxfh5UuCfnPD0sOjc0TU586dTvOu91s5XMVt1i', 1);>> schema.sql
echo -- Default password is 'admin123' (hashed with bcrypt)>> schema.sql
echo.>> schema.sql
echo -- Insert default providers if not exists>> schema.sql
echo INSERT OR IGNORE INTO api_providers (name, description, api_url) >> schema.sql
echo VALUES >> schema.sql
echo ('OpenAI', 'OpenAI API for ChatGPT, GPT-4, and other models', 'https://api.openai.com'),>> schema.sql
echo ('Anthropic', 'Anthropic API for Claude models', 'https://api.anthropic.com'),>> schema.sql
echo ('Cohere', 'Cohere API for Command models', 'https://api.cohere.ai'),>> schema.sql
echo ('Mistral', 'Mistral API for Mistral models', 'https://api.mistral.ai');>> schema.sql

echo Creating init-db.js...

rem Create setup directory and initialization script
mkdir setup
echo const sqlite3 = require('sqlite3').verbose();> setup\init-db.js
echo const path = require('path');>> setup\init-db.js
echo const fs = require('fs');>> setup\init-db.js
echo const bcrypt = require('bcrypt');>> setup\init-db.js
echo.>> setup\init-db.js
echo // Ensure data directory exists>> setup\init-db.js
echo const dataDir = path.join(__dirname, '../data');>> setup\init-db.js
echo if (!fs.existsSync(dataDir)) {>> setup\init-db.js
echo   fs.mkdirSync(dataDir, { recursive: true });>> setup\init-db.js
echo }>> setup\init-db.js
echo.>> setup\init-db.js
echo // Database file path>> setup\init-db.js
echo const DB_PATH = path.join(dataDir, 'mcp.db');>> setup\init-db.js
echo.>> setup\init-db.js
echo // Create database connection>> setup\init-db.js
echo const db = new sqlite3.Database(DB_PATH, (err) => {>> setup\init-db.js
echo   if (err) {>> setup\init-db.js
echo     console.error('X Database connection error:', err.message);>> setup\init-db.js
echo     process.exit(1);>> setup\init-db.js
echo   }>> setup\init-db.js
echo   console.log('✓ Connected to the MCP SQLite database');>> setup\init-db.js
echo });>> setup\init-db.js
echo.>> setup\init-db.js
echo // Read and execute the schema SQL>> setup\init-db.js
echo const schemaPath = path.join(__dirname, '../schema.sql');>> setup\init-db.js
echo const schemaSql = fs.readFileSync(schemaPath, 'utf8');>> setup\init-db.js
echo.>> setup\init-db.js
echo db.exec(schemaSql, (err) => {>> setup\init-db.js
echo   if (err) {>> setup\init-db.js
echo     console.error('X Error initializing database:', err.message);>> setup\init-db.js
echo     db.close();>> setup\init-db.js
echo     process.exit(1);>> setup\init-db.js
echo   }>> setup\init-db.js
echo   >> setup\init-db.js
echo   console.log('✓ Database schema initialized successfully');>> setup\init-db.js
echo   >> setup\init-db.js
echo   console.log('✓ Setup complete!');>> setup\init-db.js
echo   console.log('');>> setup\init-db.js
echo   console.log('Default admin credentials:');>> setup\init-db.js
echo   console.log('   Username: admin');>> setup\init-db.js
echo   console.log('   Password: admin123');>> setup\init-db.js
echo   console.log('');>> setup\init-db.js
echo   console.log('⚠️  Important: Change the default admin password after first login!');>> setup\init-db.js
echo   console.log('');>> setup\init-db.js
echo   console.log('🚀 Start the server with: npm start');>> setup\init-db.js
echo   >> setup\init-db.js
echo   db.close();>> setup\init-db.js
echo });>> setup\init-db.js

echo Creating README.md...

echo # WMCP Server> README.md
echo.>> README.md
echo WMCP (World Model Context Protocol) is a backend server for a local, offline-capable chatbot system with model management, user authentication, and admin statistics.>> README.md
echo.>> README.md
echo ## Features>> README.md
echo.>> README.md
echo - **Offline Operation**: Works without internet connection in private mode>> README.md
echo - **SQLite Database**: Lightweight embedded database for local storage>> README.md
echo - **User Authentication**: Secure login and registration system>> README.md
echo - **Model Management**: Add and manage different AI models locally>> README.md
echo - **External API Integration**: Support for OpenAI, Anthropic, Cohere, and Mistral APIs>> README.md
echo - **User API Keys**: Users can add their own API keys for external services>> README.md
echo - **Admin Interface**: View statistics and manage users/models>> README.md
echo - **Chat History**: Store and retrieve conversation history>> README.md
echo - **Private Mode**: Enhanced privacy with local-only processing>> README.md
echo.>> README.md
echo ## Quick Start>> README.md
echo.>> README.md
echo 1. Make sure you have Node.js (v14+) installed>> README.md
echo 2. Run `npm install` to install dependencies>> README.md
echo 3. Run `npm run setup` to initialize the database>> README.md
echo 4. Run `npm start` to start the server>> README.md
echo 5. Access the API at http://localhost:3000>> README.md
echo.>> README.md
echo ## Default Admin Account>> README.md
echo.>> README.md
echo Username: `admin`  >> README.md
echo Password: `admin123`>> README.md
echo.>> README.md
echo **Important**: Change the default admin password immediately after the first login.>> README.md

echo Creating placeholder file in models directory...
echo.> models\.gitkeep

echo Installing dependencies...

rem Install dependencies
call npm install

echo Initializing database...

rem Run database initialization
mkdir data
call node setup\init-db.js

echo ======================================================================================
echo   WMCP Server setup complete!
echo ======================================================================================
echo.
echo The server is set up in: %CD%
echo. 
echo To start the server, run:
echo   cd %CD%
echo   npm start
echo.
echo The server will be available at: http://localhost:3000
echo. 
echo Default admin credentials:
echo   Username: admin
echo   Password: admin123
echo.
echo IMPORTANT: Change the default admin password after the first login!
echo ======================================================================================
