// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import React, { createContext, useState, useMemo } from 'react';

const ModelLoadingContext = createContext();

export const ModelLoadingProvider = ({ children }) => {
  const [loadingModel, setLoadingModel] = useState(null);

  const contextValue = useMemo(() => ({
    loadingModel,
    setLoadingModel,
  }), [loadingModel]);

  return (
    <ModelLoadingContext.Provider value={contextValue}>
      {children}
    </ModelLoadingContext.Provider>
  );
};

export default ModelLoadingContext;
