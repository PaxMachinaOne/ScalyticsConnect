#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
# Scalytics Connect Frontend Setup Script

set -e # Exit on error

echo "======================================================================================"
echo "  Scalytics Connect - Frontend Setup"
echo "======================================================================================"
echo

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v14 or higher)."
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

# Create the project directory
FRONTEND_DIR="frontend"
mkdir -p "$FRONTEND_DIR"

echo "📁 Setting up Scalytics Connect frontend in '$FRONTEND_DIR' directory..."

# Create React App
echo "⏳ Creating React app structure (this may take a few minutes)..."
npx create-react-app "$FRONTEND_DIR" --template cra-template

# Navigate to the frontend directory
cd "$FRONTEND_DIR"

# Clean up default files
rm -f src/App.css src/App.js src/App.test.js src/logo.svg src/reportWebVitals.js src/setupTests.js

# Install dependencies
echo "📦 Installing dependencies..."
npm install --save react-router-dom@6.18.0 axios@1.6.2 react-markdown@8.0.7 @headlessui/react@1.7.17
npm install --save-dev tailwindcss@3.3.5 postcss@8.4.31 autoprefixer@10.4.16 @tailwindcss/forms @tailwindcss/typography

# Init Tailwind CSS
echo "🎨 Setting up Tailwind CSS..."
npx tailwindcss init -p

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p src/assets/styles
mkdir -p src/assets/images
mkdir -p src/components/{common,auth,chat,dashboard,settings,admin}
mkdir -p src/contexts
mkdir -p src/hooks
mkdir -p src/pages
mkdir -p src/services
mkdir -p src/utils

# Create package.json
echo "📄 Creating package.json..."
cat > package.json << 'EOL'
{
  "name": "scalytics-connect",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@headlessui/react": "^1.7.17",
    "@testing-library/jest-dom": "^5.17.0",
    "@testing-library/react": "^13.4.0",
    "@testing-library/user-event": "^13.5.0",
    "axios": "^1.6.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-markdown": "^8.0.7",
    "react-router-dom": "^6.18.0",
    "react-scripts": "5.0.1",
    "web-vitals": "^2.1.4"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "devDependencies": {
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "@tailwindcss/forms": "^0.5.7",
    "@tailwindcss/typography": "^0.5.10"
  },
  "proxy": "http://localhost:3000"
}
EOL

# Create tailwind.config.js
echo "📄 Creating Tailwind configuration..."
cat > tailwind.config.js << 'EOL'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'blue': {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          '"Noto Sans"',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
  darkMode: 'class', // Enable dark mode with class-based approach
}
EOL

# Create .env file
echo "📄 Creating environment file..."
cat > .env << 'EOL'
# API URL
REACT_APP_API_URL=http://localhost:3000/api

# Add other environment variables here
REACT_APP_APP_NAME=Scalytics Connect
REACT_APP_VERSION=0.1.0
EOL

# Create CSS file
echo "📄 Creating CSS file..."
cat > src/assets/styles/index.css << 'EOL'
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}

/* Chat message styling */
.prose pre {
  @apply bg-gray-800 text-white p-4 rounded-md overflow-x-auto;
}

.prose code {
  @apply bg-gray-100 text-gray-800 px-1 py-0.5 rounded;
}

.prose pre code {
  @apply bg-transparent text-white p-0;
}

/* Dark mode support */
.dark {
  @apply bg-gray-900 text-white;
}

.dark .bg-white {
  @apply bg-gray-800;
}

.dark .bg-gray-50 {
  @apply bg-gray-700;
}

.dark .bg-gray-100 {
  @apply bg-gray-700;
}

.dark .text-gray-900 {
  @apply text-white;
}

.dark .text-gray-800 {
  @apply text-gray-100;
}

.dark .text-gray-700 {
  @apply text-gray-200;
}

.dark .text-gray-600 {
  @apply text-gray-300;
}

.dark .text-gray-500 {
  @apply text-gray-400;
}

.dark .border-gray-200 {
  @apply border-gray-700;
}

.dark .border-gray-300 {
  @apply border-gray-600;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  @apply bg-gray-100;
}

.dark ::-webkit-scrollbar-track {
  @apply bg-gray-800;
}

::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded-full;
}

.dark ::-webkit-scrollbar-thumb {
  @apply bg-gray-600;
}

::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-400;
}

.dark ::-webkit-scrollbar-thumb:hover {
  @apply bg-gray-500;
}
EOL

# Create Logo SVG
echo "🎨 Creating logo component..."
cat > src/components/common/Logo.jsx << 'EOL'
import React from 'react';
import PropTypes from 'prop-types';

const Logo = ({ size = 'md', showText = true, className = '' }) => {
  // Size variations
  const sizes = {
    sm: { width: 120, height: 30 },
    md: { width: 200, height: 48 },
    lg: { width: 280, height: 68 }
  };
  
  const { width, height } = sizes[size] || sizes.md;
  
  return (
    <div className={`logo-container ${className}`}>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        viewBox="0 0 500 120"
        width={width} 
        height={height}
        className="logo"
      >
        {/* Background Shape */}
        <rect x="20" y="20" width="460" height="80" rx="40" fill="#f8f8f8" />
        
        {/* Scale Icon */}
        <g transform="translate(60, 60) scale(0.9)">
          <path d="M-20,-10 L20,-10 L30,10 L-30,10 Z" fill="#3b82f6" />
          <circle cx="-20" cy="-20" r="8" fill="#3b82f6" />
          <circle cx="20" cy="-20" r="8" fill="#3b82f6" />
          <rect x="-2" y="-30" width="4" height="20" fill="#3b82f6" />
        </g>
        
        {/* Connection Lines */}
        <g stroke="#3b82f6" strokeWidth="3" strokeLinecap="round">
          <path d="M110,50 C130,30 150,70 170,50" fill="none" />
          <path d="M110,70 C130,90 150,50 170,70" fill="none" />
        </g>
        
        {/* Text (conditionally rendered) */}
        {showText && (
          <g fontFamily="Arial, sans-serif" fontWeight="700">
            <text x="180" y="65" fontSize="32" fill="#1e3a8a">Scalytics</text>
            <text x="330" y="65" fontSize="32" fill="#3b82f6">Connect</text>
          </g>
        )}
        
        {/* Dots */}
        <circle cx="440" cy="50" r="6" fill="#3b82f6" />
        <circle cx="460" cy="50" r="4" fill="#3b82f6" opacity="0.7" />
        <circle cx="475" cy="50" r="2.5" fill="#3b82f6" opacity="0.5" />
      </svg>
    </div>
  );
};

Logo.propTypes = {
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showText: PropTypes.bool,
  className: PropTypes.string
};

export default Logo;
EOL

# Create main app files
echo "📄 Creating main app files..."

# Create RegisterPage component
cat > src/pages/RegisterPage.jsx << 'EOL'
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/common/Logo';
import authService from '../services/authService';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.username || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('All fields are required');
      return false;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const { username, email, password } = formData;
      
      const response = await authService.register({
        username,
        email,
        password
      });
      
      if (response.success) {
        // Get user profile after successful registration
        await authService.getProfile();
        navigate('/dashboard');
      } else {
        setError(response.message || 'Registration failed');
      }
    } catch (error) {
      setError(error.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Create a new account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Or{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              sign in to your existing account
            </Link>
          </p>
        </div>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Registration error</h3>
                <p className="mt-2 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Username"
                value={formData.username}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">Confirm Password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="h-5 w-5 text-blue-500 group-hover:text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
EOL

# Create index.jsx
cat > src/index.jsx << 'EOL'
import React from 'react';
import ReactDOM from 'react-dom/client';
import './assets/styles/index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
EOL

# Create App.jsx
cat > src/App.jsx << 'EOL'
import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Transition } from '@headlessui/react';
import routes from './routes';
import Navbar from './components/common/Navbar';

// Wrapper for the main application with transitions
const AppContent = () => {
  const location = useLocation();
  
  // Don't show navbar on auth pages
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  
  return (
    <div className="min-h-screen bg-gray-100">
      {!isAuthPage && <Navbar />}
      
      <Transition
        show={true}
        appear={true}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <main>
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
          </Routes>
        </main>
      </Transition>
    </div>
  );
};

// Main App component
const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;
EOL

# Create routes.js
cat > src/routes.js << 'EOL'
import React from 'react';
import { Navigate } from 'react-router-dom';

// Import auth service when it's created
// import authService from './services/authService';

// Import actual pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
const DashboardPage = () => <div>Dashboard Page</div>;
const ChatPage = () => <div>Chat Page</div>;
const SettingsPage = () => <div>Settings Page</div>;
const AdminPage = () => <div>Admin Page</div>;

// Protected route wrapper component - to be replaced with real implementation
const ProtectedRoute = ({ children }) => {
  // const isAuthenticated = authService.isAuthenticated();
  const isAuthenticated = true; // Placeholder
  
  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace state={{ from: window.location }} />;
  }
  
  return children;
};

// Admin route wrapper component - to be replaced with real implementation
const AdminRoute = ({ children }) => {
  // const isAuthenticated = authService.isAuthenticated();
  // const isAdmin = authService.isAdmin();
  const isAuthenticated = true; // Placeholder
  const isAdmin = true; // Placeholder
  
  if (!isAuthenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace state={{ from: window.location }} />;
  }
  
  if (!isAdmin) {
    // Redirect to dashboard if not admin
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Public route (only accessible if NOT logged in)
const PublicRoute = ({ children }) => {
  // const isAuthenticated = authService.isAuthenticated();
  const isAuthenticated = false; // Placeholder
  
  if (isAuthenticated) {
    // Redirect to dashboard if already authenticated
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Define routes
const routes = [
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    )
  },
  {
    path: '/register',
    element: (
      <PublicRoute>
        <RegisterPage />
      </PublicRoute>
    )
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/chat',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/chat/:id',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/settings/:section',
    element: (
      <ProtectedRoute>
        <SettingsPage />
      </ProtectedRoute>
    )
  },
  {
    path: '/admin',
    element: (
      <AdminRoute>
        <AdminPage />
      </AdminRoute>
    )
  },
  {
    path: '/admin/:section',
    element: (
      <AdminRoute>
        <AdminPage />
      </AdminRoute>
    )
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />
  }
];

export default routes;
EOL

# Create basic Navbar component
cat > src/components/common/Navbar.jsx << 'EOL'
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo';

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  
  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="block">
                <Logo size="sm" />
              </Link>
            </div>
          </div>
          
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <div className="flex space-x-4">
              <Link 
                to="/dashboard" 
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Dashboard
              </Link>
              
              <Link 
                to="/chat" 
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Chat
              </Link>
              
              <Link 
                to="/settings" 
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Settings
              </Link>

              <Link 
                to="/admin" 
                className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Admin
              </Link>
            </div>
          </div>
          
          {/* Mobile menu button */}
          <div className="flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-expanded="false"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="sr-only">Open main menu</span>
              {menuOpen ? (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden">
          <div className="pt-2 pb-3 space-y-1">
            <Link
              to="/dashboard"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
              onClick={() => setMenuOpen(false)}
            >
              Dashboard
            </Link>
            
            <Link
              to="/chat"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
              onClick={() => setMenuOpen(false)}
            >
              Chat
            </Link>
            
            <Link
              to="/settings"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
              onClick={() => setMenuOpen(false)}
            >
              Settings
            </Link>

            <Link
              to="/admin"
              className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-800"
              onClick={() => setMenuOpen(false)}
            >
              Admin
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
EOL

# Create basic service files
echo "📄 Creating service files..."

# Create apiService.js
cat > src/services/apiService.js << 'EOL'
import axios from 'axios';

// Create an axios instance with default config
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor for adding the auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling errors
api.interceptors.response.use(
  response => response,
  error => {
    // Handle session expiration (401)
    if (error.response && error.response.status === 401) {
      // Clear session data
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirect to login page if not already there
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login?session=expired';
      }
    }
    return Promise.reject(error);
  }
);

// Generic API service
export const apiService = {
  // GET request
  get: async (url, params = {}) => {
    try {
      const response = await api.get(url, { params });
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // POST request
  post: async (url, data = {}) => {
    try {
      const response = await api.post(url, data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // PUT request
  put: async (url, data = {}) => {
    try {
      const response = await api.put(url, data);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  },

  // DELETE request
  delete: async (url) => {
    try {
      const response = await api.delete(url);
      return response.data;
    } catch (error) {
      throw handleApiError(error);
    }
  }
};

// Error handler
const handleApiError = (error) => {
  let message = 'An unexpected error occurred';
  
  if (error.response) {
    // The server responded with a status code outside the 2xx range
    const serverMessage = error.response.data?.message;
    message = serverMessage || `Error ${error.response.status}: ${error.response.statusText}`;
  } else if (error.request) {
    // The request was made but no response was received
    message = 'No response from server. Please check your connection.';
  } else {
    // Something happened in setting up the request
    message = error.message;
  }
  
  return { message, originalError: error };
};

export default apiService;
EOL

# Create authService.js
cat > src/services/authService.js << 'EOL'
import apiService from './apiService';

const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  PROFILE: '/auth/profile',
  SETTINGS: '/auth/settings'
};

const authService = {
  /**
   * Login with username/email and password
   * @param {Object} credentials - User credentials
   * @param {string} credentials.username - Username or email
   * @param {string} credentials.password - User password
   * @returns {Promise<Object>} User data with token
   */
  login: async (credentials) => {
    try {
      const response = await apiService.post(AUTH_ENDPOINTS.LOGIN, credentials);
      
      if (response.success && response.token) {
        // Store token and user data
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @param {string} userData.username - Desired username
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @returns {Promise<Object>} Registered user data with token
   */
  register: async (userData) => {
    try {
      const response = await apiService.post(AUTH_ENDPOINTS.REGISTER, userData);
      
      if (response.success && response.token) {
        // Store token only - will need to fetch profile separately
        localStorage.setItem('token', response.token);
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get current user profile
   * @returns {Promise<Object>} User profile data
   */
  getProfile: async () => {
    try {
      const response = await apiService.get(AUTH_ENDPOINTS.PROFILE);
      
      if (response.success && response.data) {
        // Update stored user data
        localStorage.setItem('user', JSON.stringify(response.data));
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update user settings
   * @param {Object} settings - User settings to update
   * @returns {Promise<Object>} Updated settings
   */
  updateSettings: async (settings) => {
    try {
      return await apiService.put(AUTH_ENDPOINTS.SETTINGS, settings);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Logout user - clear token and storage
   */
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Redirect to login
    window.location.href = '/login';
  },

  /**
   * Check if user is authenticated
   * @returns {boolean} True if authenticated
   */
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },

  /**
   * Get current user data
   * @returns {Object|null} User data or null if not authenticated
   */
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    
    try {
      return JSON.parse(userStr);
    } catch (e) {
      console.error('Error parsing user data', e);
      return null;
    }
  },

  /**
   * Check if current user is an admin
   * @returns {boolean} True if user is admin
   */
  isAdmin: () => {
    const user = authService.getCurrentUser();
    return user ? user.isAdmin : false;
  }
};

export default authService;
EOL

# Create basic login page
cat > src/pages/LoginPage.jsx << 'EOL'
import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Logo from '../components/common/Logo';
import authService from '../services/authService';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Check if redirected from session expiry
  const sessionExpired = new URLSearchParams(location.search).get('session') === 'expired';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const { username, password } = formData;
      
      if (!username || !password) {
        setError('Please enter both username and password');
        setLoading(false);
        return;
      }
      
      const response = await authService.login(formData);
      
      if (response.success) {
        // Redirect to dashboard or previous page
        const redirectTo = location.state?.from?.pathname || '/dashboard';
        navigate(redirectTo);
      } else {
        setError(response.message || 'Login failed');
      }
    } catch (error) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Or{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              create a new account
            </Link>
          </p>
        </div>
        
        {sessionExpired && (
          <div className="rounded-md bg-yellow-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Session expired</h3>
                <p className="mt-2 text-sm text-yellow-700">Your session has expired. Please sign in again.</p>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Authentication failed</h3>
                <p className="mt-2 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Username or Email</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Username or Email"
                value={formData.username}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="h-5 w-5 text-blue-500 group-hover:text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
EOL

# Update package.json scripts to use the correct port for frontend
echo "🔧 Updating package.json scripts..."
cat > .env.development << 'EOL'
PORT=3001
REACT_APP_API_URL=http://localhost:3000/api
EOL

# Install dependencies
echo "📦 Installing dependencies (final pass)..."
npm install

echo "======================================================================================"
echo "  🎉 Scalytics Connect Frontend setup complete!"
echo "======================================================================================"
echo
echo "📂 The frontend is set up in: $(pwd)"
echo 
echo "🏁 To start the development server, run:"
echo "  cd $(pwd)"
echo "  npm start"
echo
echo "🔗 The development server will be available at: http://localhost:3001"
echo "  (It uses port 3001 to avoid conflict with the backend on port 3000)"
echo
echo "📝 Note: Make sure the backend server is running at http://localhost:3000"
echo "======================================================================================"