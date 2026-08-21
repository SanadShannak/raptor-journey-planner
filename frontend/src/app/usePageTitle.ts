import { useEffect } from 'react';
import { useLocale } from '../i18n';

/**
 * Sets the document title for a page.
 *
 * Independent of screen readers: the title is what a bookmark, a history
 * entry, and a browser tab show, and a single-page app that never updates it
 * leaves every entry named after whatever loaded first.
 *
 * Called by the page rather than the layout because only the page knows its
 * own name. React runs child effects before parent ones, so the title is
 * already correct by the time `useRouteFocus` moves focus in the layout.
 */
export function usePageTitle(title: string): void {
  const { strings, t } = useLocale();
  const appName = t(strings.app.title);

  useEffect(() => {
    // Re-runs when the locale changes, so switching language retitles the tab
    // rather than leaving the previous language in the browser's history.
    document.title = title === appName ? appName : `${title} · ${appName}`;
  }, [title, appName]);
}
