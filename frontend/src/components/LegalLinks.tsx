import { Link } from 'react-router';
import { paths } from '../app/routes';
import { useLocale } from '../i18n';

interface Props {
  className: string;
  /** Runs as a link is pressed, for a screen that has to get out of the way. */
  onNavigate?: (() => void) | undefined;
  /** For a form half filled in: the page opens beside it rather than replacing it. */
  newTab?: boolean | undefined;
}

/** The two links to the legal pages. `className` styles each, for the surface it sits on. */
export function LegalLinks({ className, onNavigate, newTab }: Props) {
  const { strings, t } = useLocale();
  const shared = {
    className,
    onClick: onNavigate,
    ...(newTab === true ? { target: '_blank', rel: 'noopener' } : {}),
  };

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Link to={paths.terms} {...shared}>
        {t(strings.legal.terms.title)}
      </Link>
      <Link to={paths.privacy} {...shared}>
        {t(strings.legal.privacy.title)}
      </Link>
    </span>
  );
}
