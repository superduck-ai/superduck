import { create } from 'zustand';
import type { ProviderConfig } from '../../utils/providerStore';

// =============================================================================
// Model Store — 模型/Provider 配置
// =============================================================================
// 从 SidepanelApp 的 useState 迁移：
// - selectedModel
// - providerConfig
// - toolSchemas
// =============================================================================

import type { ToolProviderSchema } from '../../mcpRuntime/pageToolsSupport/types';

interface ModelState {
  selectedModel: string;
  providerConfig: ProviderConfig;
  toolSchemas: ToolProviderSchema[];

  // Actions
  setSelectedModel: (model: string) => void;
  setProviderConfig: (config: ProviderConfig | ((prev: ProviderConfig) => ProviderConfig)) => void;
  setToolSchemas: (schemas: ToolProviderSchema[]) => void;
}

const defaultProviderConfig: ProviderConfig = {
  providers: []
};

export const useModelStore = create<ModelState>((set) => ({
  selectedModel: '',
  providerConfig: defaultProviderConfig,
  toolSchemas: [],

  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setProviderConfig: (config) =>
    set((state) => ({
      providerConfig: typeof config === 'function' ? config(state.providerConfig) : config
    })),
  setToolSchemas: (toolSchemas) => set({ toolSchemas })
}));
