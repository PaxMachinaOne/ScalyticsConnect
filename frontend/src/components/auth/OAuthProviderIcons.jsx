// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React from 'react';

/**
 * Get the appropriate icon for each OAuth provider
 * @param {string} provider - The provider name
 * @returns {JSX.Element} - SVG icon for the provider
 */
export const getOAuthProviderIcon = (provider) => {
  switch (provider) {
    case 'github':
      return (
        <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
        </svg>
      );
    case 'google':
      return (
        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4.67676C13.6198 4.67676 15.0593 5.2699 16.1422 6.27959L19.3633 3.143C17.4089 1.32041 14.8564 0.168701 12 0.168701C7.85974 0.168701 4.26891 2.51207 2.46422 5.97236L5.90561 8.66008C6.79201 6.3369 9.17154 4.67676 12 4.67676Z" fill="#EA4335"/>
          <path d="M23.49 12.2744C23.49 11.4627 23.4105 10.6804 23.3017 9.9274H12V14.2587H18.47C18.2026 15.6938 17.371 16.8919 16.1422 17.7036L19.3633 20.2861C21.5599 18.2964 23.49 15.5051 23.49 12.2744Z" fill="#4285F4"/>
          <path d="M5.90557 15.3406C5.62297 14.5585 5.4646 13.7173 5.4646 12.8465C5.4646 11.9756 5.62297 11.1344 5.90557 10.3524L2.46418 7.66467C1.5383 9.23988 1.01123 11.0186 1.01123 12.8465C1.01123 14.6744 1.5383 16.4531 2.46418 18.0283L5.90557 15.3406Z" fill="#FBBC05"/>
          <path d="M12 23.5242C14.8564 23.5242 17.4088 22.4425 19.3633 20.5606L16.1422 18.0073C15.1086 18.7311 13.7483 19.1602 12 19.1602C9.17154 19.1602 6.79198 17.5 5.90558 15.1769L2.46419 17.8646C4.2689 21.3541 7.85971 23.5242 12 23.5242Z" fill="#34A853"/>
        </svg>
      );
    case 'microsoft':
      return (
        <svg className="h-5 w-5 text-white" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 11H0V0H11V11Z" fill="#F25022"/>
          <path d="M23 11H12V0H23V11Z" fill="#7FBA00"/>
          <path d="M11 23H0V12H11V23Z" fill="#00A4EF"/>
          <path d="M23 23H12V12H23V23Z" fill="#FFB900"/>
        </svg>
      );
    case 'azure_ad':
      return (
        <svg className="h-5 w-5 text-white" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 11H0V0H11V11Z" fill="#F25022"/>
          <path d="M23 11H12V0H23V11Z" fill="#7FBA00"/>
          <path d="M11 23H0V12H11V23Z" fill="#00A4EF"/>
          <path d="M23 23H12V12H23V23Z" fill="#FFB900"/>
        </svg>
      );
    case 'okta':
      return (
        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.389 0 0 5.35 0 12s5.389 12 12 12 12-5.35 12-12S18.611 0 12 0zm0 18c-3.325 0-6-2.675-6-6s2.675-6 6-6 6 2.675 6 6-2.675 6-6 6z"/>
        </svg>
      );
    default:
      return (
        <svg className="h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
        </svg>
      );
  }
};

/**
 * Get the display name for a provider
 * @param {string} provider - The provider ID
 * @returns {string} - Human-readable provider name
 */
export const getProviderDisplayName = (provider) => {
  const displayNames = {
    github: 'GitHub',
    google: 'Google',
    microsoft: 'Microsoft',
    azure_ad: 'Azure AD',
    okta: 'Okta'
  };
  
  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
};

const OAuthProviderIcons = {
  getOAuthProviderIcon,
  getProviderDisplayName
};

export default OAuthProviderIcons;
