import { useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { SectionLinks } from '../components/SectionLinks';
import { usePageTitle } from '../app/usePageTitle';

/**
 * The journey planner, and the site's front door.
 *
 * Planning a journey is what nearly everyone arrives to do, so it is the root
 * rather than something reached from a landing page — one fewer click on the
 * only task most visitors have.
 */
export default function PlanPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.plan.title));

  return (
    <PageContainer>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {t(strings.pages.plan.title)}
        </h1>
        <p className="text-content-muted max-w-prose text-lg">
          {t(strings.pages.home.tagline)}
        </p>
      </div>

      {/* The form and results land in the next stage. */}
      <p className="text-content-muted">{t(strings.pages.plan.comingSoon)}</p>

      <SectionLinks />
    </PageContainer>
  );
}
