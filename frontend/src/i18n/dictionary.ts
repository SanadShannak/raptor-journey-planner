/**
 * Locale definitions and the shape every dictionary must satisfy.
 *
 * `Dictionary` is declared explicitly rather than inferred from the English
 * file so that adding a key is a compile error in *every* locale until it is
 * translated — a missing Arabic string can never reach production silently.
 */

export type Locale = 'en' | 'ar';

export type Direction = 'ltr' | 'rtl';

export const LOCALES: readonly Locale[] = ['en', 'ar'];

export const DEFAULT_LOCALE: Locale = 'en';

export const DIRECTION: Record<Locale, Direction> = {
  en: 'ltr',
  ar: 'rtl',
};

/**
 * BCP 47 tags passed to `Intl`, which are not always the same as the locale
 * key. Arabic requests Latin digits (`-u-nu-latn`) because route designations
 * arrive from GTFS in Latin script (`"M2"`, `"550"`); rendering clock times in
 * Arabic-Indic numerals beside them would read inconsistently.
 *
 * Switch `ar` to plain `'ar'` to get Arabic-Indic digits instead.
 */
export const INTL_LOCALE: Record<Locale, string> = {
  en: 'en',
  ar: 'ar-u-nu-latn',
};

/**
 * Language names are always written in their own language, never translated,
 * so they live here instead of inside each dictionary.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

/**
 * How each locale invites a switch to itself, phrased in that locale.
 *
 * Shown on the toggle as the language you are *not* using, so it reads as an
 * offer rather than a statement of the current setting — and it is legible to
 * exactly the person who needs it.
 */
export const SWITCH_TO_LOCALE: Record<Locale, string> = {
  en: 'In English',
  ar: 'بالعربية',
};

/**
 * A message with one form per CLDR plural category. Only `other` is mandatory;
 * English uses `one`/`other`, while Arabic uses all six.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** Either a fixed string or a set of plural forms selected by a `count`. */
export type Message = string | PluralForms;

export interface Dictionary {
  app: {
    title: string;
  };
  language: {
    /** Accessible label for the language switcher. */
    switcherLabel: string;
    /**
     * Describes what the language toggle does, named after the language it
     * switches to. Used as both the tooltip and the control's description —
     * not its name, which stays the visible text so that what a voice-control
     * user reads aloud is what activates the control.
     */
    switchTo: string;
  };

  nav: {
    /** Names the primary navigation landmark for a screen reader. */
    primaryLabel: string;
    /** Names the secondary section links below the planner. */
    sectionsLabel: string;
    /** First focusable control on the page; jumps past the header. */
    skipToContent: string;
    /** Toggle for the navigation panel on narrow screens. */
    openMenu: string;
    closeMenu: string;
    home: string;
    plan: string;
    routes: string;
    stops: string;
    card: string;
  };

  /** One entry per page: the `<h1>` and, where useful, its supporting copy. */
  pages: {
    home: {
      title: string;
      tagline: string;
      planCard: string;
      planCardBody: string;
      routesCard: string;
      routesCardBody: string;
      stopsCard: string;
      stopsCardBody: string;
      cardCard: string;
      cardCardBody: string;
    };
    plan: { title: string; comingSoon: string };
    routes: { title: string; comingSoon: string };
    stops: { title: string; comingSoon: string };
    card: { title: string; needsAccount: string };
    notFound: { title: string; body: string; backHome: string };
  };

  /**
   * Sign-in is never a gate: these open a dialog over whatever the visitor was
   * doing, and nothing on the site requires them.
   */
  auth: {
    logIn: string;
    signUp: string;
    close: string;
    name: string;
    email: string;
    password: string;
    submitLogIn: string;
    submitSignUp: string;
    switchToSignUp: string;
    switchToLogIn: string;
    /** Shown on submit — accounts do not exist yet, and pretending is worse. */
    unavailable: string;
    nameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    passwordRequired: string;
    passwordTooShort: string;
  };
  theme: {
    /** Accessible label for the colour-scheme switcher. */
    switcherLabel: string;
    /** Accessible names for the theme toggle, describing what it will do. */
    switchToLight: string;
    switchToDark: string;
    light: string;
    dark: string;
    /** Follow the operating system's colour scheme. */
    system: string;
  };
  status: {
    checkingBackend: string;
    backendReachable: string;
    backendUnreachable: string;
    availableDates: PluralForms;
  };

  /*
   * Abbreviated units, deliberately.
   *
   * "1 hour 25 minutes" needs plural agreement on two independent counts in
   * one message, which `PluralForms` cannot express (it selects on a single
   * `count`) and which must not be assembled from two translated fragments.
   * Abbreviations do not inflect, so the problem disappears rather than being
   * faked — and they are what transit UIs use anyway.
   */
  units: {
    minutes: string;
    hours: string;
    hoursMinutes: string;
    meters: string;
    kilometers: string;
  };

  /**
   * Transit mode names, one per standard GTFS `route_type`, plus a fallback
   * for a feed that sends a code outside the standard set.
   */
  modes: {
    tram: string;
    metro: string;
    rail: string;
    bus: string;
    ferry: string;
    cableTram: string;
    aerialLift: string;
    funicular: string;
    trolleybus: string;
    monorail: string;
    unknown: string;
  };

  /**
   * User-facing failure messages, mapped from the API's `errorCode` by
   * `apiError.ts`. The API's own `error` string is developer-facing English
   * and is never shown.
   *
   * Note there is no message for `NO_ROUTE_FOUND`: a search that legitimately
   * finds nothing is an empty state, not a failure, and callers branch on it
   * before reaching this table.
   */
  errors: {
    generic: string;
    network: string;
    timeout: string;
    malformed: string;
    serverError: string;
    missingOrigin: string;
    missingDestination: string;
    badDate: string;
    badTime: string;
    sameOriginTarget: string;
    noActiveServices: string;
    originOutOfBounds: string;
    originStopNotFound: string;
    destinationOutOfBounds: string;
    destinationStopNotFound: string;
  };
}
