// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; 
import App from './App';
import './services/websocketManager';
import './services/eventBusConnector';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
