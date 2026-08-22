import { useLocale } from '../i18n';
import { MenuButton, type MenuOption } from '../components/MenuButton';
import { THEME_CHOICES, type ThemeChoice } from './theme';
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

/** A screen, for "follow whatever this device is set to". */
const SystemIcon = () => (
  <svg {...iconProps}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8.5 21h7M12 17v4" />
  </svg>
);

const ICONS: Record<ThemeChoice, () => React.ReactElement> = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemIcon,
};

/**
 * Colour scheme, as an icon that opens a menu.
 *
 * The closed button shows the icon of the *chosen* setting rather than the
 * resolved one — on "system" that is the screen icon, which is the honest
 * answer to "what is this set to". Showing a sun or moon there would suggest a
 * fixed choice that has not been made.
 */
export function ThemeMenu() {
  const { strings, t } = useLocale();
  const { choice, setTheme } = useTheme();

  const labelFor: Record<ThemeChoice, string> = {
    light: t(strings.theme.light),
    dark: t(strings.theme.dark),
    system: t(strings.theme.system),
  };

  const options: MenuOption<ThemeChoice>[] = THEME_CHOICES.map((option) => {
    const Icon = ICONS[option];
    return { value: option, label: labelFor[option], icon: <Icon /> };
  });

  const Current = ICONS[choice];

  return (
    <MenuButton
      label={t(strings.theme.menuLabel, { value: labelFor[choice] })}
      trigger={<Current />}
      options={options}
      value={choice}
      onSelect={setTheme}
    />
  );
}
