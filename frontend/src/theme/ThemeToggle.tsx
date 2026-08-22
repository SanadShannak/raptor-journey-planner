import { useLocale } from '../i18n';
import { Tooltip } from '../components/Tooltip';
import { useTheme } from './themeContext';

const iconProps = {
  viewBox: '0 0 24 24',
  width: 16,
  height: 16,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg {...iconProps}>
    <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
  </svg>
);

/**
 * Switches between light and dark in one click.
 *
 * The icon shows what you will get, not what you have — a moon while the page
 * is light. That matches the language toggle beside it, which offers the
 * language you are not reading, so both controls answer the same question:
 * what happens if I press this.
 *
 * "System" survives as the *starting* state even though it is not one of the
 * two the toggle moves between. Someone who has never touched this still gets
 * their operating system's setting, and the first press switches away from
 * whatever that resolved to. Only pressing it counts as choosing.
 */
export function ThemeToggle() {
  const { strings, t } = useLocale();
  const { resolved, setTheme } = useTheme();

  const goingToDark = resolved === 'light';
  const label = t(
    goingToDark ? strings.theme.switchToDark : strings.theme.switchToLight,
  );

  return (
    <Tooltip text={label}>
      <button
        type="button"
        onClick={() => setTheme(goingToDark ? 'dark' : 'light')}
        aria-label={label}
        className="rounded-control border-chrome-border text-on-chrome focus-visible:outline-on-chrome inline-flex h-9 cursor-pointer items-center gap-1.5 border px-2.5 text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {goingToDark ? <MoonIcon /> : <SunIcon />}
      </button>
    </Tooltip>
  );
}
