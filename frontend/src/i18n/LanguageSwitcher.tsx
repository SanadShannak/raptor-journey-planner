import { LOCALES, LOCALE_NAMES } from './dictionary';
import { useLocale } from './localeContext';

/*
 * Extracted from the old placeholder screen so it can sit in the app bar.
 *
 * Styled for the wine chrome, not for a page surface: the selected state
 * inverts to `bg-on-chrome text-chrome` rather than using `brand-fill`, which
 * on the bar would be wine on wine. Contrast is symmetric, so the already
 * verified on-chrome/chrome pair covers both states with no new token.
 */
export function LanguageSwitcher() {
  const { locale, strings, t, setLocale } = useLocale();

  return (
    <div
      className="flex gap-1"
      role="group"
      aria-label={t(strings.language.switcherLabel)}
    >
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          onClick={() => setLocale(option)}
          aria-current={option === locale}
          className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome aria-[current=true]:bg-on-chrome aria-[current=true]:text-chrome cursor-pointer border px-2.5 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {LOCALE_NAMES[option]}
        </button>
      ))}
    </div>
  );
}
