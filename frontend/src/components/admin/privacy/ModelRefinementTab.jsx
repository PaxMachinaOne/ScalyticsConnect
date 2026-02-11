// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { useState, useEffect } from 'react';
import apiService from '../../../services/apiService';
import { toast } from 'react-toastify';
import ConfirmationModal from '../../common/ConfirmationModal'; 

const ModelRefinementTab = () => {
  const [archiveEnabled, setArchiveEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showFirstConfirmModal, setShowFirstConfirmModal] = useState(false);
  const [showSecondConfirmModal, setShowSecondConfirmModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const CONFIRM_PHRASE = "Yes, switch off";

  useEffect(() => {
    const fetchSetting = async () => {
      setIsLoading(true);
      try {
        const response = await apiService.get('/admin/privacy/chat-archival');
        if (response.success && response.data) {
          setArchiveEnabled(response.data.archive_deleted_chats_for_refinement);
        } else {
          toast.error('Failed to load chat archival setting.');
        }
      } catch (error) {
        console.error('Error fetching chat archival setting:', error);
        toast.error(error.message || 'Error fetching setting.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSetting();
  }, []);

  const handleToggleChange = async (e) => {
    const newEnabledState = e.target.checked;

    if (archiveEnabled && !newEnabledState) { 
      setShowFirstConfirmModal(true);
    } else { 
      await updateSetting(newEnabledState);
    }
  };

  const updateSetting = async (newEnabledState, deleteArchived = false) => {
    setIsLoading(true);
    try {
      const payload = { enabled: newEnabledState };
      if (deleteArchived) {
        payload.deleteArchivedChats = true;
      }
      const response = await apiService.put('/admin/privacy/chat-archival', payload);
      if (response.success) {
        setArchiveEnabled(newEnabledState);
        toast.success(response.message || 'Setting updated successfully.');
        if (deleteArchived) {
          toast.info('Archived chats are being deleted in the background.');
        }
      } else {
        toast.error(response.message || 'Failed to update setting.');
        setArchiveEnabled(!newEnabledState); 
      }
    } catch (error) {
      console.error('Error updating chat archival setting:', error);
      toast.error(error.message || 'Error updating setting.');
      setArchiveEnabled(!newEnabledState);
    } finally {
      setIsLoading(false);
      setShowFirstConfirmModal(false);
      setShowSecondConfirmModal(false);
      setConfirmInput('');
    }
  };

  const handleFirstConfirm = () => {
    setShowFirstConfirmModal(false);
    setShowSecondConfirmModal(true);
  };

  const handleFirstCancel = () => {
    setShowFirstConfirmModal(false);
  };

  const handleSecondConfirm = async () => {
    if (confirmInput === CONFIRM_PHRASE) {
      await updateSetting(false, true); 
    } else {
      toast.error("Confirmation phrase does not match. Action cancelled.");
      setShowSecondConfirmModal(false);
      setConfirmInput('');
    }
  };

  const handleSecondCancel = () => {
    setShowSecondConfirmModal(false);
    setConfirmInput('');
  };

  return (
    <div>
      <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-dark-text-primary mb-4">
        Model Refinement Settings
      </h3>
      <div className="bg-white dark:bg-dark-primary shadow sm:rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-dark-text-secondary">
              Archive Deleted Chats for Refinement
            </h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              When enabled, chats "deleted" by users will be archived instead of permanently removed.
              This allows the chat content to be used for internal model refinement purposes.
              Archived chats will not be visible to users.
            </p>
          </div>
          <div className="ml-4">
            {isLoading && !showFirstConfirmModal && !showSecondConfirmModal ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900 dark:border-gray-100"></div>
            ) : (
              <label htmlFor="archiveToggle" className="flex items-center cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    id="archiveToggle"
                    className="sr-only"
                    checked={archiveEnabled}
                    onChange={handleToggleChange}
                    disabled={isLoading}
                  />
                  <div className={`block w-10 h-6 rounded-full transition ${archiveEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                  <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${archiveEnabled ? 'transform translate-x-full' : ''}`}></div>
                </div>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* First Confirmation Modal */}
      <ConfirmationModal
        isOpen={showFirstConfirmModal}
        onClose={handleFirstCancel}
        onConfirm={handleFirstConfirm}
        title="Confirm Disable Model Refinement"
        message="Switching Model Refinement off will delete all archived messages and they can't be used to refine the running AI model. Proceed?"
        confirmText="Yes, Proceed"
        cancelText="No, Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      {/* Second Confirmation Modal (Destructive Action) */}
      <ConfirmationModal
        isOpen={showSecondConfirmModal}
        onClose={handleSecondCancel}
        onConfirm={handleSecondConfirm}
        title="⚠️ Are you absolutely sure?"
        message={`This is a destructive action and cannot be undone. All archived chat data used for model refinement will be permanently deleted. To confirm, please type "${CONFIRM_PHRASE}" into the field below.`}
        confirmText="Confirm Deletion"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        isConfirmDisabled={confirmInput !== CONFIRM_PHRASE || isLoading}
      >
        <input
          type="text"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          placeholder={`Type "${CONFIRM_PHRASE}"`}
          className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-dark-primary dark:text-dark-text-primary"
          disabled={isLoading}
        />
      </ConfirmationModal>
    </div>
  );
};

export default ModelRefinementTab;
