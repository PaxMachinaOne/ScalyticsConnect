// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';

// Basic Modal structure - needs styling and potentially a reusable Modal component
const RuleEditModal = ({ rule, group, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    rule_type: 'regex',
    pattern: '',
    replacement: '',
    description: '',
    is_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const isSystemRule = rule?.is_system_default === 1 || rule?.is_system_default === true;

  useEffect(() => {
    if (rule) {
      setFormData({
        rule_type: rule.rule_type || 'regex',
        pattern: rule.pattern || '',
        replacement: rule.replacement || '',
        description: rule.description || '',
        is_active: rule.is_active !== undefined ? !!rule.is_active : true,
      });
    } else {
      setFormData({
        rule_type: 'regex',
        pattern: '',
        replacement: '',
        description: '',
        is_active: true,
      });
    }
  }, [rule]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    try {
      await onSave(formData); 
      onClose(); 
    } catch (err) {
      setError(err.message || 'Failed to save rule.');
    } finally {
      setIsSaving(false);
    }
  };

  // TODO: Add better styling, potentially use a common Modal component
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
      <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-dark-primary">
        {/* Modal Header with Close Button */}
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary">
            {rule ? 'Edit' : 'Create'} Filter Rule for "{group?.name}"
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center dark:hover:bg-gray-600 dark:hover:text-white"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div>
            <label htmlFor="rule_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rule Type</label>
            <select
              id="rule_type"
              name="rule_type"
              value={formData.rule_type}
              onChange={handleChange}
              required
              disabled={isSystemRule} 
              className={`mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-dark-text-primary focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md ${isSystemRule ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="regex">Regex</option>
              <option value="ner_PERSON">NER: Person</option>
              <option value="ner_ORG">NER: Organization</option>
              <option value="ner_GPE">NER: Location</option>
              <option value="ner_DATE">NER: Date</option>
              {/* Add more NER types or Presidio types as needed */}
            </select>
          </div>

          <div>
            <label htmlFor="pattern" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {formData.rule_type === 'regex' ? 'Regex Pattern' : 'Entity Type'}
            </label>
            <input
              type="text"
              name="pattern"
              id="pattern"
              value={formData.pattern}
              onChange={handleChange}
              required
              disabled={isSystemRule} 
              className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-dark-text-primary rounded-md ${isSystemRule ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder={formData.rule_type === 'regex' ? '/\\b\\d{16}\\b/gi' : 'PERSON'}
            />
             <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
               {formData.rule_type === 'regex' ? 'Enter the full regex pattern.' : 'Enter the NER/Presidio entity type (e.g., PERSON, CREDIT_CARD_NUMBER).'}
             </p>
          </div>

          <div>
            <label htmlFor="replacement" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Replacement Text (Optional)</label>
            <input
              type="text"
              name="replacement"
              id="replacement"
              value={formData.replacement}
              onChange={handleChange}
              disabled={isSystemRule} 
              className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-dark-text-primary rounded-md ${isSystemRule ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="[REDACTED]"
            />
             <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave blank for default '[REDACTED]' or '[ENTITY_LABEL]'.</p>
          </div>

           <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description (Optional)</label>
            <input
              type="text"
              name="description"
              id="description"
              value={formData.description}
              onChange={handleChange}
              disabled={isSystemRule} 
              className={`mt-1 block w-full shadow-sm sm:text-sm border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-dark-text-primary rounded-md ${isSystemRule ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
          </div>

          <div className="flex items-center">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              checked={formData.is_active}
              onChange={handleChange}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
            />
            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
              Rule Active
            </label>
          </div>

          <div className="pt-4 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isSystemRule} 
              className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 ${isSystemRule ? 'cursor-not-allowed' : ''}`}
            >
              {isSaving ? 'Saving...' : (rule ? (isSystemRule ? 'Cannot Save Default' : 'Save Changes') : 'Create Rule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RuleEditModal;
