import { useLocale } from '../i18n';
import { THEME_CHOICES, type ThemeChoice } from './theme';
import { useTheme } from './themeContext';

/*
 * The options are mutually exclusive, so they are real radio inputs rather
 * than buttons: that gets arrow-key navigation, a single tab stop, and the
 * correct "2 of 3" announcement from a screen reader without any ARIA.
 *
 * The inputs are visually hidden but still focusable and still hit-testable
 * under their labels; the ring is drawn on the sibling span via `peer-*`.
 * `:has()` would express this more directly but lands after the Firefox
 * version in the browser baseline, so the peer pattern is used instead.
 *
 * Styled for the wine app bar, which is the only place it renders. The
 * selected state inverts to `bg-on-chrome text-chrome`: `brand-fill` on
 * `chrome` would be wine on wine, and it would break the rule that anything
 * placed on a bar is contrast-checked against the bar.
 */
export function ThemeSwitcher() {
  const { strings, t } = useLocale();
  const { choice, setTheme } = useTheme();

  const labels: Record<ThemeChoice, string> = {
    light: t(strings.theme.light),
    dark: t(strings.theme.dark),
    system: t(strings.theme.system),
  };

  return (
    <fieldset className="flex gap-1">
      <legend className="sr-only">{t(strings.theme.switcherLabel)}</legend>

      {THEME_CHOICES.map((option) => (
        <label key={option} className="cursor-pointer">
          <input
            type="radio"
            name="theme"
            value={option}
            checked={option === choice}
            onChange={() => setTheme(option)}
            className="peer sr-only"
          />
          <span className="rounded-control border-chrome-border text-on-chrome peer-checked:bg-on-chrome peer-checked:border-on-chrome peer-focus-visible:outline-on-chrome block border px-2.5 py-1 text-sm peer-checked:text-chrome peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
            {labels[option]}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
