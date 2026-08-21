import { useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';

export default function PlanPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.plan.title));

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(strings.pages.plan.title)}
      </h1>
      <p className="text-content-muted">{t(strings.pages.plan.comingSoon)}</p>
    </PageContainer>
  );
}
