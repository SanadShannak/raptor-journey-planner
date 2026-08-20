import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LocaleProvider, applyDocumentLocale, resolveInitialLocale } from './i18n';
import { ThemeProvider, applyDocumentTheme, resolveInitialThemeChoice } from './theme';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root was not found in index.html.');
}

// Set lang/dir and the colour scheme before the first paint, so an Arabic
// visitor never sees a left-to-right flash and someone who chose dark never
// sees a white one. A visitor on "system" needs nothing applied here — the
// stylesheet's prefers-color-scheme rule already painted the first frame.
applyDocumentLocale(resolveInitialLocale());
applyDocumentTheme(resolveInitialThemeChoice());

createRoot(rootElement).render(
  <StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </LocaleProvider>
  </StrictMode>,
);
