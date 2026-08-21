import { Link } from 'react-router';
import { useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';
import { paths } from '../app/routes';

export default function HomePage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.home.title));

  const sections = [
    { to: paths.plan, title: strings.pages.home.planCard, body: strings.pages.home.planCardBody },
    { to: paths.routes, title: strings.pages.home.routesCard, body: strings.pages.home.routesCardBody },
    { to: paths.stops, title: strings.pages.home.stopsCard, body: strings.pages.home.stopsCardBody },
    { to: paths.card, title: strings.pages.home.cardCard, body: strings.pages.home.cardCardBody },
  ];

  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t(strings.pages.home.title)}
        </h1>
        <p className="text-content-muted max-w-prose text-lg">
          {t(strings.pages.home.tagline)}
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
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
    </PageContainer>
  );
}
