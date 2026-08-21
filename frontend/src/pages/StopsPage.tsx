import { useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';

export default function StopsPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.stops.title));

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(strings.pages.stops.title)}
      </h1>
      <p className="text-content-muted">{t(strings.pages.stops.comingSoon)}</p>
    </PageContainer>
  );
}
