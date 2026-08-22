import { MenuButton, type MenuOption } from '../components/MenuButton';
import { LOCALES, LOCALE_NAMES, type Locale } from './dictionary';
import { useLocale } from './localeContext';

/**
 * A globe, not a flag.
 *
 * Flags stand for countries, and a language is not a country — Arabic belongs
 * to two dozen of them, and picking one to represent it excludes the rest.
 */
const GlobeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z" />
  </svg>
);

/** Two-letter code shown beside the globe, so the current language is visible. */
const SHORT_CODE: Record<Locale, string> = { en: 'EN', ar: 'ع' };

/**
 * Language, as an icon that opens a menu.
 *
 * Each option is written in its own language and marked with `lang`, so a
 * screen reader pronounces "العربية" in Arabic rather than attempting it in
 * the surrounding one.
 */
export function LanguageMenu() {
  const { locale, strings, t, setLocale } = useLocale();

  const options: MenuOption<Locale>[] = LOCALES.map((option) => ({
    value: option,
    label: LOCALE_NAMES[option],
    icon: (
      <span lang={option} className="text-xs font-semibold">
        {SHORT_CODE[option]}
      </span>
    ),
  }));

  return (
    <MenuButton
      label={t(strings.language.menuLabel, { value: LOCALE_NAMES[locale] })}
      trigger={
        <>
          <GlobeIcon />
          <span lang={locale} aria-hidden="true">
            {SHORT_CODE[locale]}
          </span>
        </>
      }
      options={options}
      value={locale}
      onSelect={setLocale}
    />
  );
}
