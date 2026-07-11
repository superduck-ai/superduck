import ReactDOM from 'react-dom/client';
import { IntlMessageLoaderProvider } from '../index-react-dom-intl';
import SidepanelApp from './SidepanelApp';
import { initSidepanelThemeMode } from './themeMode';
import 'katex/dist/katex.min.css';

// Telemetry disabled — Sentry and Honeycomb are upstream production
// telemetry. They install MutationObservers, PerformanceObservers, and XHR
// interceptors that cause significant CPU overhead. Uncomment if needed for
// debugging.
// safeInit('sentry', initSentry);
// safeInit('honeycomb', initHoneycomb);

initSidepanelThemeMode();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root container');
}

ReactDOM.createRoot(root).render(
  <IntlMessageLoaderProvider>
    <SidepanelApp />
  </IntlMessageLoaderProvider>
);
