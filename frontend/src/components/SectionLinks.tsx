import { Link } from 'react-router';
import { useLocale } from '../i18n';
import { paths } from '../app/routes';

/**
 * Entry points to the sections that are not the planner.
 *
 * Sits below the planner rather than in front of it. Planning a journey is
 * what nearly everyone arrives to do, so it gets the top of the page; these
 * exist so browsing lines, stops, and card balance are discoverable to
 * somebody who did not think to look in the navigation.
 */
export function SectionLinks() {
  const { strings, t } = useLocale();

  const sections = [
    {
      to: paths.routes,
      title: strings.pages.home.routesCard,
      body: strings.pages.home.routesCardBody,
    },
    {
      to: paths.stops,
      title: strings.pages.home.stopsCard,
      body: strings.pages.home.stopsCardBody,
    },
    {
      to: paths.card,
      title: strings.pages.home.cardCard,
      body: strings.pages.home.cardCardBody,
    },
  ];

  return (
    <nav aria-label={t(strings.nav.sectionsLabel)}>
      <ul className="grid gap-4 sm:grid-cols-3">
        {sections.map((section) => (
          <li key={section.to}>
            <Link
              to={section.to}
              className="rounded-card border-border bg-surface-raised hover:border-brand-500 focus-visible:outline-brand-500 flex h-full flex-col gap-1.5 border p-5 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <span className="text-brand-500 font-semibold">{t(section.title)}</span>
              <span className="text-content-muted text-sm">{t(section.body)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
