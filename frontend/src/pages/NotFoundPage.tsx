import { Link } from 'react-router';
import { useLocale } from '../i18n';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';
import { paths } from '../app/routes';

export default function NotFoundPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.notFound.title));

  return (
    <PageContainer>
      <h1 className="text-3xl font-semibold tracking-tight">
        {t(strings.pages.notFound.title)}
      </h1>
      <p className="text-content-muted max-w-prose">{t(strings.pages.notFound.body)}</p>
      <p>
        <Link
          to={paths.home}
          className="text-brand-500 focus-visible:outline-brand-500 rounded-control underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t(strings.pages.notFound.backHome)}
        </Link>
      </p>
    </PageContainer>
  );
}
