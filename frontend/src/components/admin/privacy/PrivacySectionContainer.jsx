// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ContentFilteringManager from './ContentFilteringManager';
import GlobalPrivacyTab from './GlobalPrivacyTab'; 
import AirGappedTab from './AirGappedTab'; 
import ModelRefinementTab from './ModelRefinementTab'; 

const PrivacySectionContainer = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const subSection = location.hash.substring(1) || 'filtering';

  const handleSubTabChange = (newSubSection) => {
    navigate(`/admin/privacy#${newSubSection}`);
  };

  const subTabs = [
    { id: 'filtering', name: 'Content Filtering' },
    { id: 'global', name: 'Global Privacy Mode' },
    { id: 'airgap', name: 'Air-Gapped Mode' },
    { id: 'refinement', name: 'Model Refinement' }, 
  ];

  return (
    <div className="container mx-auto py-4">
       <div className="bg-white dark:bg-dark-primary shadow-md rounded-lg overflow-hidden">

        {/* Sub-tab Navigation */}
        <div className="border-b border-gray-200 dark:border-dark-border">
            <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
              {subTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleSubTabChange(tab.id)}
                  className={`
                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm focus:outline-none
                    ${subSection === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-dark-link'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'}
                  `}
                  aria-current={subSection === tab.id ? 'page' : undefined}
                >
                  {tab.name}
                </button>
              ))}
            </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {subSection === 'filtering' && <ContentFilteringManager />}
          {subSection === 'global' && <GlobalPrivacyTab />}
          {subSection === 'airgap' && <AirGappedTab />}
          {subSection === 'refinement' && <ModelRefinementTab />} {/* Render new tab content */}
        </div>
      </div>
    </div>
  );
};

export default PrivacySectionContainer;
