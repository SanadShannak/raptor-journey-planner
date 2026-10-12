import { Link } from 'react-router';
import { useLocale } from '../i18n';
import { PRIMARY_ACTION, StatusPanel } from '../components/StatusPanel';
import { usePageTitle } from '../app/usePageTitle';
import { paths } from '../app/routes';

/**
 * Any address that matches no route. The same centred card as the other
 * standalone status pages, with one way on.
 */
export default function NotFoundPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.notFound.title));

  return (
    <StatusPanel tone="lost" title={t(strings.pages.notFound.title)}>
      <p className="text-content-muted max-w-prose">{t(strings.pages.notFound.body)}</p>
      <Link to={paths.home} className={PRIMARY_ACTION}>
        {t(strings.pages.notFound.backHome)}
      </Link>
    </StatusPanel>
  );
}
