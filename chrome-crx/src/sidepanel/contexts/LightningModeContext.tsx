import { createContext, useContext } from 'react';

interface LightningModeContextValue {
  isPurlMode: boolean;
  lightningResult: any | null;
}

const LightningModeContext = createContext<LightningModeContextValue>({
  isPurlMode: false,
  lightningResult: null
});

export const LightningModeProvider = LightningModeContext.Provider;

export function useLightningModeContext() {
  return useContext(LightningModeContext);
}
