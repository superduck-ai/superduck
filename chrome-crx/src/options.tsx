import './styles/index.css';
import './styles/scheduling.css';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AnalyticsContext } from './components/providers/AppProviders';
import { IntlMessageLoaderProvider } from './index-react-dom-intl';
import { OptionsPage } from './options/OptionsPage';

const DevAppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'superduck');
  }, []);

  return (
    <IntlMessageLoaderProvider>
      <AnalyticsContext.Provider value={{ resetAnalytics: async () => {} }}>
        <TooltipPrimitive.Provider>{children}</TooltipPrimitive.Provider>
      </AnalyticsContext.Provider>
    </IntlMessageLoaderProvider>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DevAppWrapper>
      <OptionsPage />
    </DevAppWrapper>
  </React.StrictMode>
);
