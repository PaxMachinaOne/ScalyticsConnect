// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../../services/apiService'; 
import { toast } from 'react-toastify';
import RuleEditModal from './RuleEditModal'; 

const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', model: 'en_core_web_sm' },
  { code: 'de', name: 'German', model: 'de_core_news_sm' },
  { code: 'fr', name: 'French', model: 'fr_core_news_sm' },
  { code: 'es', name: 'Spanish', model: 'es_core_news_sm' },
];

const ContentFilteringManager = () => {
  const [filterGroups, setFilterGroups] = useState([]);
  const [filterRules, setFilterRules] = useState({}); 
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [error, setError] = useState('');
  const [activeLanguages, setActiveLanguages] = useState([]); 
  const [isSavingLanguages, setIsSavingLanguages] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [selectedGroupForRules, setSelectedGroupForRules] = useState(null); 
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleToEdit, setRuleToEdit] = useState(null); 

  const loadInitialData = useCallback(async () => {
    setIsLoadingGroups(true);
    setInitialLoadComplete(false);
      setError('');
      try {
        const [groupsRes, langRes] = await Promise.all([
          apiService.getFilterGroups(),
          apiService.get('/admin/settings/active-filter-languages') 
        ]);

        if (groupsRes?.success && Array.isArray(groupsRes.data)) {
        setFilterGroups(groupsRes.data || []);
      } else {
        throw new Error(groupsRes?.message || 'Failed to load filter groups due to unexpected format.');
      }

      if (langRes?.success && Array.isArray(langRes.data)) {
         setActiveLanguages(langRes.data);
      } else {
         console.warn('Failed to load active languages or unexpected format, defaulting to English.');
         setActiveLanguages(['en']); 
      }

    } catch (err) {
      console.error("Error loading initial filtering data:", err); 
      setError(err.message || 'Failed to load initial data.');
      setFilterGroups([]);
      setActiveLanguages(['en']); 
    } finally {
      setIsLoadingGroups(false);
      setInitialLoadComplete(true);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const fetchRulesForGroup = useCallback(async (groupId) => {
    if (!groupId) {
       if (selectedGroupForRules?.id) {
           setFilterRules(prev => ({ ...prev, [selectedGroupForRules.id]: undefined }));
       }
      return;
    }
    setIsLoadingRules(true);
    setError(''); 
    try {
      const result = await apiService.getFilterRules(groupId);
      if (result.success) {
        setFilterRules(prev => ({ ...prev, [groupId]: result.data || [] }));
      } else {
        throw new Error(result.message || `Failed to fetch rules for group ${groupId}.`);
      }
    } catch (err) {
      console.error(`Error fetching rules for group ${groupId}:`, err);
      setError(err.message || `Failed to fetch rules.`);
      setFilterRules(prev => ({ ...prev, [groupId]: [] })); 
    } finally {
      setIsLoadingRules(false);
    }
  }, [selectedGroupForRules?.id]); 

  useEffect(() => {
    if (selectedGroupForRules?.id) {
      fetchRulesForGroup(selectedGroupForRules.id);
    } else {
       setFilterRules({});
    }
  }, [selectedGroupForRules, fetchRulesForGroup]);


  const handleLanguageToggle = (langCode) => {
    setActiveLanguages(prev =>
      prev.includes(langCode)
        ? prev.filter(code => code !== langCode)
        : [...prev, langCode]
    );
  };

  const handleSaveLanguages = async () => {
    setIsSavingLanguages(true);
    setError('');
    try {
      const result = await apiService.put('/admin/settings/active-filter-languages', { languages: activeLanguages }); 
      if (result?.success) { 
        toast.success(result.message || 'Active languages updated successfully!');
      } else {
        throw new Error(result?.message || 'Failed to save active languages.');
      }
    } catch (err) {
      console.error("Error saving active languages:", err);
      setError(err.message || 'Failed to save active languages.');
      toast.error(err.message || 'Failed to save active languages.');
    } finally {
      setIsSavingLanguages(false);
    }
  };

  const handleGroupToggle = async (groupId, currentIsEnabled) => {
      const groupIndex = filterGroups.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return;

      const updatedData = { is_enabled: !currentIsEnabled };
      const originalGroup = filterGroups[groupIndex];
      const updatedGroup = { ...originalGroup, ...updatedData };
      const originalGroups = [...filterGroups];

      setFilterGroups(prev => prev.map(g => g.id === groupId ? updatedGroup : g));

      try {
          const result = await apiService.updateFilterGroup(groupId, updatedData);
          if (result?.success && result?.data) {
              setFilterGroups(prev => prev.map(g => g.id === groupId ? result.data : g)); 
              toast.success(`Filter group '${result.data.name}' ${result.data.is_enabled ? 'enabled' : 'disabled'}.`);
          } else {
              throw new Error(result?.message || 'Failed to update group status.');
          }
      } catch (err) {
          console.error("Error toggling filter group:", err);
          toast.error(`Failed to update group: ${err.message}`);
          setFilterGroups(originalGroups); 
      }
  };

  // --- Modal Handlers ---
  const openRuleModal = (rule = null) => {
    if (!rule && !selectedGroupForRules) {
        toast.warn("Please select a filter group first before adding a rule.");
        return;
    }
    setRuleToEdit(rule);
    setIsRuleModalOpen(true);
  };

  const closeRuleModal = () => {
    setIsRuleModalOpen(false);
    setRuleToEdit(null);
  };

  // --- Rule CRUD Handlers ---
  const handleSaveRule = async (ruleFormData) => {
    if (!selectedGroupForRules?.id) {
      throw new Error("No filter group selected.");
    }

    const groupId = selectedGroupForRules.id;
    const dataToSave = { ...ruleFormData, is_active: !!ruleFormData.is_active };

    try {
      let result;
      if (ruleToEdit?.id) {
        result = await apiService.updateFilterRule(ruleToEdit.id, dataToSave);
        if (result?.success && result?.data) {
          toast.success(`Rule updated successfully!`);
          setFilterRules(prev => ({ ...prev, [groupId]: (prev[groupId] || []).map(r => r.id === ruleToEdit.id ? result.data : r) }));
        } else { throw new Error(result?.message || 'Failed to update rule.'); }
      } else {
        result = await apiService.createFilterRule(groupId, dataToSave);
         if (result?.success && result?.data) {
           toast.success(`Rule created successfully!`);
           setFilterRules(prev => ({ ...prev, [groupId]: [...(prev[groupId] || []), result.data] }));
         } else { throw new Error(result?.message || 'Failed to create rule.'); }
      }
    } catch (err) {
       console.error("Error saving rule:", err);
       throw err; 
    }
  };

  const handleDeleteRule = async (ruleId) => {
     if (!selectedGroupForRules?.id || !ruleId) return;
     const groupId = selectedGroupForRules.id;

     if (!window.confirm(`Are you sure you want to delete this rule? This cannot be undone.`)) return;

     try {
       const result = await apiService.deleteFilterRule(ruleId);
       if (result?.success) {
         toast.success('Rule deleted successfully!');
         setFilterRules(prev => ({ ...prev, [groupId]: (prev[groupId] || []).filter(r => r.id !== ruleId) }));
       } else { throw new Error(result?.message || 'Failed to delete rule.'); }
     } catch (err) {
       console.error("Error deleting rule:", err);
       toast.error(`Failed to delete rule: ${err.message}`);
     }
   };

  // --- Rule Active Toggle Handler ---
  const handleRuleToggle = async (ruleId, currentIsActive) => {
    if (!selectedGroupForRules?.id) return;
    const groupId = selectedGroupForRules.id;
    const newIsActive = !currentIsActive;

    // Optimistic UI update
    const originalRules = filterRules[groupId] ? [...filterRules[groupId]] : [];
    const ruleIndex = originalRules.findIndex(r => r.id === ruleId);
    if (ruleIndex === -1) return; 

    const updatedRule = { ...originalRules[ruleIndex], is_active: newIsActive };
    const updatedRulesList = originalRules.map(r => r.id === ruleId ? updatedRule : r);

    setFilterRules(prev => ({ ...prev, [groupId]: updatedRulesList }));

    try {
      const result = await apiService.updateFilterRuleStatus(ruleId, newIsActive);
      if (result?.success && result?.data) {
        setFilterRules(prev => ({
          ...prev,
          [groupId]: (prev[groupId] || []).map(r => r.id === ruleId ? result.data : r)
        }));
        toast.success(`Rule status updated successfully!`);
      } else {
        throw new Error(result?.message || 'Failed to update rule status.');
      }
    } catch (err) {
      console.error("Error toggling rule status:", err);
      toast.error(`Failed to update rule status: ${err.message}`);
      setFilterRules(prev => ({ ...prev, [groupId]: originalRules }));
    }
  };

  // Show loading indicator until initial data (groups and languages) is fetched
  if (!initialLoadComplete) {
     return <div className="text-center p-4">Loading filtering configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">Content Filtering Rules</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Define rules to automatically filter or redact sensitive information (like PII, credentials) from AI responses based on user permissions.
        Filters are applied unless a user belongs to a group with the corresponding 'filter:bypass_*' permission.
      </p>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      )}

      {/* Section for Enabling/Disabling Languages */}
      <div className="p-4 border rounded-md dark:border-dark-border bg-white dark:bg-dark-primary shadow-sm">
         <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-dark-text-primary">Active Filter Languages (NER)</h3>
         <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Select which languages the NER filtering worker should load models for.</p>
         <div className="space-y-2">
            {AVAILABLE_LANGUAGES.map(lang => (
              <label key={lang.code} className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeLanguages.includes(lang.code)}
                  onChange={() => handleLanguageToggle(lang.code)}
                  className="form-checkbox h-5 w-5 text-blue-600 dark:text-dark-link bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2"
                />
                <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">{lang.name} ({lang.code})</span>
              </label>
            ))}
         </div>
         <div className="mt-4">
           <button
             onClick={handleSaveLanguages}
             disabled={isSavingLanguages}
             className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {isSavingLanguages ? 'Saving...' : 'Save Active Languages'}
           </button>
         </div>
      </div>


      {/* Section for Filter Groups */}
      <div className="p-4 border rounded-md dark:border-dark-border bg-white dark:bg-dark-primary shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">Filter Groups</h3>
          {/* Cannot create conceptual groups via UI */}
        </div>
        {isLoadingGroups ? (
           <div className="text-center p-4">Loading groups...</div>
        ) : filterGroups.length === 0 ? (
           <div className="text-center p-4 text-gray-500 dark:text-gray-400">No filter groups defined yet. (Run migration?)</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
            <thead className="bg-gray-50 dark:bg-dark-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Filtering Enabled</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Exemption Permission</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
              {filterGroups.map((group) => (
                <tr key={group.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">{group.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={group.description}>{group.description || '-'}</td>
                  <td className="px-4 py-3 text-center text-sm">
                     <input
                       type="checkbox"
                       className="form-checkbox h-5 w-5 text-blue-600 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 cursor-pointer"
                       checked={!!group.is_enabled}
                       onChange={() => handleGroupToggle(group.id, !!group.is_enabled)}
                       title={group.is_enabled ? 'Click to disable this filter group' : 'Click to enable this filter group'}
                     />
                  </td>
                   <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono" title={group.exemption_permission_key || 'No exemption permission linked'}>{group.exemption_permission_key || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => {
                        setSelectedGroupForRules(prevSelected =>
                          prevSelected?.id === group.id ? null : group
                        );
                      }}
                      className={`px-2 py-1 text-xs rounded-md ${selectedGroupForRules?.id === group.id ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-800'}`}
                    >
                      {selectedGroupForRules?.id === group.id ? 'Close Rules' : 'View Rules'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Section for Filter Rules (conditionally rendered) */}
      {selectedGroupForRules && (
        <div className="p-4 border rounded-md dark:border-dark-border mt-6 bg-white dark:bg-dark-primary shadow-sm">
           <div className="flex justify-between items-center mb-4">
             <h3 className="text-lg font-medium mb-2 text-gray-900 dark:text-dark-text-primary">
               Filter Rules for <span className="font-semibold">{selectedGroupForRules.name}</span>
             </h3>
             <button
                onClick={() => openRuleModal()} 
                className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
             >
                + New Rule
             </button>
           </div>
           {isLoadingRules ? (
              <div className="text-center p-4">Loading rules...</div>
           ) : (!filterRules[selectedGroupForRules.id] || filterRules[selectedGroupForRules.id].length === 0) ? (
              <div className="text-center p-4 text-gray-500 dark:text-gray-400">No rules defined for this group yet.</div>
           ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
                <thead className="bg-gray-50 dark:bg-dark-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Pattern / Entity</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Replacement</th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Active</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-primary divide-y divide-gray-200 dark:divide-dark-border">
                  {(filterRules[selectedGroupForRules.id] || []).map((rule) => {
                    const isSystemRule = rule.is_system_default === 1 || rule.is_system_default === true;
                    return (
                    <tr key={rule.id} className={isSystemRule ? 'bg-gray-50 dark:bg-dark-primary/50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {rule.rule_type}
                        {isSystemRule && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">(Default)</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono max-w-md truncate" title={rule.pattern}>{rule.pattern}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{rule.replacement || '[REDACTED]'}</td>
                      <td className="px-4 py-3 text-center">
                         {/* TODO: Make rule active toggle interactive - Allow toggle for system rules */}
                         <input
                           type="checkbox"
                           className={`form-checkbox h-5 w-5 text-blue-600 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 cursor-pointer`}
                           checked={!!rule.is_active}
                           onChange={() => handleRuleToggle(rule.id, !!rule.is_active)}
                           title={rule.is_active ? 'Click to deactivate rule' : 'Click to activate rule'}
                         />
                         {/* <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${rule.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                           {rule.is_active ? 'Active' : 'Inactive'}
                         </span> */}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                         <button
                           onClick={() => openRuleModal(rule)}
                           className={`text-blue-600 hover:text-blue-900 dark:text-dark-link dark:hover:text-dark-link ${isSystemRule ? 'opacity-50 cursor-not-allowed' : ''}`}
                           disabled={isSystemRule}
                           title={isSystemRule ? "Cannot edit system default rules" : "Edit Rule"}
                         >
                           Edit
                         </button>
                         <button
                           onClick={() => handleDeleteRule(rule.id)}
                           className={`text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 ${isSystemRule ? 'opacity-50 cursor-not-allowed' : ''}`}
                           disabled={isSystemRule}
                           title={isSystemRule ? "Cannot delete system default rules" : "Delete Rule"}
                         >
                           Delete
                         </button>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
           )}
        </div>
      )}

      {isRuleModalOpen && selectedGroupForRules && (
        <RuleEditModal
           rule={ruleToEdit}
           group={selectedGroupForRules}
           onClose={closeRuleModal}
           onSave={handleSaveRule}
        />
      )}

    </div>
  );
};

export default ContentFilteringManager;
