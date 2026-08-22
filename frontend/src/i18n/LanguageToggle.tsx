import { useId } from 'react';
import { Tooltip } from '../components/Tooltip';
import {
  LOCALES,
  LOCALE_NAMES,
  SWITCH_TO_LOCALE,
  type Locale,
} from './dictionary';
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

/**
 * Switches between the two languages in one click.
 *
 * The face shows the language you are *not* reading, written in that language:
 * "بالعربية" while the page is English. Somebody who cannot read the current
 * language can still recognise their own — which is the only text on the page
 * that has to work for them.
 *
 * That is also why the label is not translated. It belongs to the language it
 * names, so it is marked with `lang` and read in that language rather than
 * mispronounced in the surrounding one.
 */
export function LanguageToggle() {
  const { locale, strings, t, setLocale } = useLocale();

  const other = LOCALES.find((candidate) => candidate !== locale) as Locale;
  const face = SWITCH_TO_LOCALE[other];
  const description = t(strings.language.switchTo, {
    value: LOCALE_NAMES[other],
  });
  const descriptionId = useId();

  /*
   * No `aria-label`. The accessible name stays the visible text, so what a
   * voice-control user reads on the button is what activates it; the tooltip
   * supplies the "switch to" context as a description instead of replacing
   * the name with it.
   */
  return (
    <Tooltip text={description} describedById={descriptionId}>
      <button
        type="button"
        onClick={() => setLocale(other)}
        aria-describedby={descriptionId}
        className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex h-9 cursor-pointer items-center gap-1.5 border px-2.5 text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <GlobeIcon />
        <span lang={other}>{face}</span>
      </button>
    </Tooltip>
  );
}
