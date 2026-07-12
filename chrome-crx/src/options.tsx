import './styles/index.css';
import './styles/scheduling.css';
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { IntlMessageLoaderProvider } from './index-react-dom-intl';
import { OptionsPage } from './options/OptionsPage';
import { initExtensionThemeMode } from './themeMode';

const DevAppWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => initExtensionThemeMode('console'), []);

  return (
    <IntlMessageLoaderProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
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
