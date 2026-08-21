import { useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';

export default function CardPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.card.title));

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(strings.pages.card.title)}
      </h1>
      {/*
        Reachable, and honest about what it needs. Sign-in is never a gate, so
        this explains rather than redirecting anyone to a login wall.
      */}
      <p className="text-content-muted max-w-prose">
        {t(strings.pages.card.needsAccount)}
      </p>
    </PageContainer>
  );
}
