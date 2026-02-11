import React, { useState, useEffect, useCallback } from 'react';
import ModelsList from './ModelsList';
import ModelEditForm from './ModelEditForm';
import ModelDiscovery from './ModelDiscovery';
import ModelStats from './ModelStats';
import ModelUploader from './ModelUploader';
import ModelProgressPanel from './ModelProgressPanel';
import EmbeddingModelEditForm from './EmbeddingModelEditForm';
import GpuPanel from './GpuPanel'; 
import useModelData from './hooks/useModelData';
import useModelForm from './hooks/useModelForm';
import useModelActions from './hooks/useModelActions';
import { useModelStatus } from '../../../contexts/ModelStatusContext';
import eventBus from '../../../utils/eventBus';
import gpuService from '../../../services/gpuService'; 

const ModelManagerContent = ({
  models,
  providers,
  providersAvailable,
  availableGpuIds,
  poolStatus,
  refreshData,
  refreshPoolStatus,
  initialDataError,
  isLoading,
  preferredEmbeddingModelId 
}) => {

  const [activeTab, setActiveTab] = useState('list');
  const [modelTypeFilter, setModelTypeFilter] = useState('all');
  const [showStats, setShowStats] = useState(false);
  const [modelStats, setModelStats] = useState(null);
  const [localModelOptions, setLocalModelOptions] = useState({ basePath: '', recursive: true });
  const [showEmbeddingEditForm, setShowEmbeddingEditForm] = useState(false); 
  const [embeddingModelToEdit, setEmbeddingModelToEdit] = useState(null);
  const [showProgressPanel, setShowProgressPanel] = useState(false);
  const [progressModelId, setProgressModelId] = useState(null);
  const [activationToken, setActivationToken] = useState(null);
  const [listActivationProgress, setListActivationProgress] = useState({});
  const progressPanelRef = React.useRef(null);
  const [gpuStats, setGpuStats] = useState([]);
  const [actuallyActivatingModels, setActuallyActivatingModels] = useState(new Set());

  const {
    formData, isExternalModel, selectedModel,
    handleInputChange, loadModelIntoForm, resetForm,
  } = useModelForm(providers);

  const {
    saving, activating, discoveryInProgress, resetInProgress,
    success, error: actionError, activationErrors, activatingModelId,
    saveModelConfig, activateAndSaveModel, deleteModel, toggleModelActive,
    discoverModels, resetAllModels, fetchModelStats,
    setPreferredEmbeddingModel,
    settingPreferred,
    saveEmbeddingModelDetails, 
    saving: actionSaving 
  } = useModelActions(
    refreshData, 
    resetForm, 
    refreshPoolStatus
  );

  useEffect(() => {
    const fetchGpuStats = async () => {
      try {
        const stats = await gpuService.getGpuStats();
        setGpuStats(stats);
      } catch (error) {
        console.error("Failed to fetch GPU stats:", error);
      }
    };

    fetchGpuStats();
    const interval = setInterval(fetchGpuStats, 5000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    const unsubscribe = eventBus.subscribe('activation:complete', (activationId, data) => {
      setActuallyActivatingModels(prev => {
        const newSet = new Set(prev);
        newSet.delete(Number(data.modelId));
        return newSet;
      });
      refreshData();
    });
    
    return unsubscribe;
  }, [refreshData]);

  const handleToggleActive = async (modelId, modelName, currentStatus, isExternal) => {
    if (!currentStatus && !isExternal) {
      setActuallyActivatingModels(prev => new Set(prev).add(modelId));
    }
    
    const result = await toggleModelActive(modelId, modelName, currentStatus, isExternal);
    if (result && result.success && result.activationId) {
      setListActivationProgress(prev => ({
        ...prev,
        [modelId]: { activationId: result.activationId }
      }));
    }
  };

  const handleActivateAndSave = async () => {
    const result = await activateAndSaveModel(formData, selectedModel, isExternalModel);
    if (result && result.success && result.activationId) {
      setProgressModelId(selectedModel.id);
      setActivationToken(result.activationId);
      setShowProgressPanel(true);
      setActiveTab('list');
    }
  };

  const handleEditModel = useCallback((model) => {
    loadModelIntoForm(model);
    setActiveTab('details');
  }, [loadModelIntoForm]);

  const handleViewStats = useCallback(async (modelId) => {
    const stats = await fetchModelStats(modelId);
    if (stats) {
      setModelStats(stats);
      setShowStats(true);
    }
  }, [fetchModelStats]);

  const handleEditEmbeddingModel = useCallback((model) => {
    setEmbeddingModelToEdit(model);
    setShowEmbeddingEditForm(true);
  }, []);

  return (
    <div className="relative">
      {(isLoading || saving || activating || discoveryInProgress || resetInProgress || settingPreferred) && (
        <div className="absolute inset-0 bg-gray-500 bg-opacity-50 flex justify-center items-center z-50">
          <p className="text-white text-lg">
            {saving || actionSaving ? 'Saving...' : 
             activating ? 'Activating...' : 
             discoveryInProgress ? 'Discovering...' : 
             resetInProgress ? 'Resetting...' : 
             settingPreferred ? 'Setting...' :
             'Loading...'}
          </p>
        </div>
      )}
      {success && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert">{success}</div>}
      {actionError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">{actionError}</div>}
      {initialDataError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">Error loading initial data: {initialDataError}</div>}

      {gpuStats && gpuStats.length > 0 && (
        <GpuPanel gpuStats={gpuStats} models={models} />
      )}

      <div className="bg-white dark:bg-dark-primary shadow overflow-hidden sm:rounded-lg mb-6">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-dark-text-primary">Model Management</h3>
            <div className="flex space-x-2">
              <button onClick={() => setActiveTab('list')} className={`px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}>List</button>
              <button onClick={() => setActiveTab('discover')} className={`px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'discover' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}>Discover</button>
              <button onClick={() => { resetForm(); setActiveTab('details'); }} className={`px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'details' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}>Add New</button>
              <button onClick={() => setActiveTab('upload')} className={`px-3 py-2 text-sm font-medium rounded-md ${activeTab === 'upload' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}>Upload</button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'list' && (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex space-x-4">
                  <button
                    onClick={() => setModelTypeFilter('all')}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${modelTypeFilter === 'all' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setModelTypeFilter('online')}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${modelTypeFilter === 'online' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}
                  >
                    Online
                  </button>
                  <button
                    onClick={() => setModelTypeFilter('local')}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${modelTypeFilter === 'local' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-secondary'}`}
                  >
                    Local
                  </button>
                </div>
              </div>
              <ModelsList
                models={models.filter(model => {
                  if (modelTypeFilter === 'all') return true;
                  if (modelTypeFilter === 'online') return !!model.external_provider_id;
                  if (modelTypeFilter === 'local') return !model.external_provider_id;
                  return true;
                })}
                providers={providers}
                onEditModel={handleEditModel}
                onToggleActive={handleToggleActive}
                onDeleteModel={deleteModel}
                onViewStats={handleViewStats}
                poolStatus={poolStatus}
                activationErrors={activationErrors}
                activatingModelId={actuallyActivatingModels.size > 0 ? Array.from(actuallyActivatingModels)[0] : activatingModelId}
                preferredEmbeddingModelId={preferredEmbeddingModelId}
                onSetPreferredEmbeddingModel={setPreferredEmbeddingModel}
                onEditEmbeddingModel={handleEditEmbeddingModel}
                refreshData={refreshData}
                loading={isLoading}
                listActivationProgress={listActivationProgress}
                onCloseListProgress={(modelId) => {
                  setListActivationProgress(prev => {
                    const updated = { ...prev };
                    delete updated[modelId];
                    return updated;
                  });
                }}
              />
            </>
          )}

          {activeTab === 'discover' && (
            <ModelDiscovery
              onDiscover={discoverModels}
              onReset={resetAllModels}
              localModelOptions={localModelOptions}
              setLocalModelOptions={setLocalModelOptions}
              providers={providersAvailable}
              onAddModel={loadModelIntoForm}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'details' && (
            <ModelEditForm
              formData={formData}
              onInputChange={handleInputChange}
              onSave={() => saveModelConfig(formData, selectedModel, isExternalModel)}
              onActivateAndSave={handleActivateAndSave}
              onCancel={() => { resetForm(); setActiveTab('list'); }}
              isExternalModel={isExternalModel}
              providers={providers}
              availableGpuIds={availableGpuIds}
              resetForm={resetForm}
              saving={saving}
              activating={activating}
              poolStatus={poolStatus}
            />
          )}

          {activeTab === 'upload' && (
            <ModelUploader 
              onUploadComplete={() => {
                refreshData();
                setActiveTab('list');
              }}
            />
          )}
        </div>
      </div>

      {showStats && modelStats && (
        <ModelStats
          modelStats={modelStats}
          onClose={() => setShowStats(false)}
        />
      )}

      {showEmbeddingEditForm && embeddingModelToEdit && (
        <EmbeddingModelEditForm
          model={embeddingModelToEdit}
          onClose={() => {
            setShowEmbeddingEditForm(false);
            setEmbeddingModelToEdit(null);
          }}
          onSave={saveEmbeddingModelDetails}
          saving={actionSaving}
        />
      )}

      {showProgressPanel && (
        <ModelProgressPanel
          ref={progressPanelRef}
          modelId={progressModelId}
          token={activationToken}
          onClose={() => {
            setShowProgressPanel(false);
            setProgressModelId(null);
            setActivationToken(null);
            refreshData();
            refreshPoolStatus();
          }}
        />
      )}
    </div>
  );
};

const ModelManager = () => {
  const {
    models, providers, providersAvailable, availableGpuIds,
    preferredEmbeddingModelId,
    loading: dataLoading,
    error: dataError,
    refreshData,
  } = useModelData();

  const { poolStatus, refreshPoolStatus } = useModelStatus();

  return (
    <ModelManagerContent
      models={models}
      providers={providers}
      providersAvailable={providersAvailable}
      availableGpuIds={availableGpuIds}
      poolStatus={poolStatus}
      refreshData={refreshData}
      refreshPoolStatus={refreshPoolStatus}
      initialDataError={dataError}
      isLoading={dataLoading}
      preferredEmbeddingModelId={preferredEmbeddingModelId}
    />
  );
};
export default ModelManager;
