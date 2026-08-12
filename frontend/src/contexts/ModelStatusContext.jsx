// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import adminService from '../services/adminService';
import eventBus from '../utils/eventBus'; // Import the global event bus

const ModelStatusContext = createContext(null);

export const useModelStatus = () => useContext(ModelStatusContext);

export const ModelStatusProvider = ({ children }) => {
  const [poolStatus, setPoolStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPoolStatus = useCallback(async () => {
    try {
      const statusData = await adminService.getWorkerPoolStatus(); 
      setPoolStatus(statusData || null); 
    } catch (err) {
      console.error('Error fetching worker pool status in Context:', err);
      setError('Failed to fetch worker pool status.');
      setPoolStatus(null); 
    } finally {
       if (loading) setLoading(false);
    }
  }, [loading]); 

  useEffect(() => {
    fetchPoolStatus();

    const handlePoolUpdate = (data) => {
        console.log('[ModelStatusContext] Received pool:status_update event:', data);
        setPoolStatus(prevStatus => ({
            ...prevStatus,
            ...data,
        }));
    };

    const unsubscribePoolUpdate = eventBus.subscribe('pool:status_update', handlePoolUpdate);
    const unsubscribeActivationComplete = eventBus.subscribe('activation:complete', fetchPoolStatus);

    const intervalId = setInterval(fetchPoolStatus, 15000); 

    return () => {
      clearInterval(intervalId);
      unsubscribePoolUpdate();
      unsubscribeActivationComplete();
    }; 
  }, [fetchPoolStatus]);

  const value = {
    poolStatus,
    loading, 
    error,  
    refreshPoolStatus: fetchPoolStatus 
  };

  return (
    <ModelStatusContext.Provider value={value}>
      {children}
    </ModelStatusContext.Provider>
  );
};
