import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LocaleProvider, applyDocumentLocale, resolveInitialLocale } from './i18n';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found in index.html.');
}

// Set lang/dir before the first paint so an Arabic visitor never sees a
// left-to-right flash.
applyDocumentLocale(resolveInitialLocale());

createRoot(rootElement).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
);
