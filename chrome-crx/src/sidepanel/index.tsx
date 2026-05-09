import ReactDOM from 'react-dom/client';
import { FeatureProvider } from '../SavedPromptsService';
import { IntlMessageLoaderProvider } from '../index-react-dom-intl';
import { SidepanelApp } from './SidepanelApp';
import 'katex/dist/katex.min.css';
import '../styles/scheduling.css';

// Telemetry disabled — Sentry and Honeycomb are upstream production
// telemetry. They install MutationObservers, PerformanceObservers, and XHR
// interceptors that cause significant CPU overhead. Uncomment if needed for
// debugging.
// safeInit('sentry', initSentry);
// safeInit('honeycomb', initHoneycomb);

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root container');
}

ReactDOM.createRoot(root).render(
  <IntlMessageLoaderProvider>
    <FeatureProvider>
      <SidepanelApp />
    </FeatureProvider>
  </IntlMessageLoaderProvider>
);
