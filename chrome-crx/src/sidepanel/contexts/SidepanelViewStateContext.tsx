import { createContext, useContext } from 'react';
import type { useSidepanelState } from '../hooks/useSidepanelState';

export type SidepanelViewState = ReturnType<typeof useSidepanelState>;

const SidepanelViewStateContext = createContext<SidepanelViewState | null>(null);

export const SidepanelViewStateProvider = SidepanelViewStateContext.Provider;

export function useSidepanelViewState(): SidepanelViewState {
  const ctx = useContext(SidepanelViewStateContext);
  if (!ctx) {
    throw new Error('useSidepanelViewState must be used within SidepanelViewStateProvider');
  }
  return ctx;
}
