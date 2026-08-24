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

  /** The journey planner: its form, its results, and its empty states. */
  planner: {
    origin: string;
    destination: string;
    /**
     * An example of what goes in the field, shown on top of its label and
     * never instead of one. It names the *kinds* of thing the geocoder
     * accepts, which is not obvious from "From" alone.
     */
    originPlaceholder: string;
    destinationPlaceholder: string;
    swap: string;
    useMyLocation: string;
    locating: string;
    locationDenied: string;
    locationUnavailable: string;
    myLocation: string;
    date: string;
    time: string;
    today: string;
    tomorrow: string;
    yesterday: string;
    chooseTime: string;
    /** Sets the date and time to the network's own current clock. */
    leaveNow: string;
    hour: string;
    minute: string;
    meridiem: string;
    am: string;
    pm: string;
    /** Closes the time picker; three columns cannot close on a single pick. */
    done: string;
    walkingSpeed: string;
    speedSlow: string;
    speedCalm: string;
    speedAverage: string;
    speedFast: string;
    submit: string;
    kmh: string;
    searching: string;
    /** Second line of the loader, while the engine is being asked. */
    searchingHint: string;
    suggestionsAvailable: PluralForms;
    searchUnavailable: string;
    isStop: string;
    /**
     * The designation printed on a stop, e.g. "Platform 5".
     *
     * GTFS carries the number and nothing else — it never says whether the
     * thing is a platform, a track, or a stand — so the word is chosen from
     * the mode of the vehicle involved. Rail gets {@link track}; everything
     * else gets this. That mirrors how the networks themselves speak: HSL
     * prints *raide* on a train and *laituri* on a bus stand.
     */
    platform: string;
    /** The rail form of {@link platform}, e.g. "Track 3". */
    track: string;
    chooseOrigin: string;
    chooseDestination: string;
    /** Shown when the search worked and there is simply nothing to travel on. */
    noJourney: string;
    noJourneyHint: string;
    resultsFound: PluralForms;
    departAt: string;
    arriveAt: string;
    totalDuration: string;
    changes: PluralForms;
    later: string;
    noLater: string;
    /**
     * A leg on foot, named and nothing more.
     *
     * It used to phrase itself around its two ends — "Walk from Start", "Walk
     * to Destination" — which restated the nodes drawn immediately above and
     * below it in the strip map, in worse words than they use.
     */
    walk: string;
    transitLeg: string;
    towards: string;
    wait: string;
    /** The wait drawn as its own segment, between an arrival and a departure. */
    waitHere: string;
    intermediateStops: PluralForms;
    showStops: string;
    hideStops: string;
    arrivesNextDay: string;
    /**
     * The journey leaves on a different day from the one that was searched.
     *
     * Searching late can push the first departure past midnight, and a
     * twelve-hour clock cannot say so on its own — "12:15 AM" beside a search
     * for the 24th reads as fifteen minutes past midnight *that* morning,
     * which has already been and gone.
     */
    departsOnDate: string;
    /** The engine can legitimately answer with no transit at all. */
    walkOnly: string;
    /** Names the map region for a screen reader. */
    mapLabel: string;
    /** Leaflet writes these as both `title` and `aria-label` on its buttons. */
    zoomIn: string;
    zoomOut: string;

    /* The overview list, and the detail panel one itinerary opens into. */
    /**
     * Accessible names for the button an overview card is built from.
     *
     * One button, two actions: a card that is not the one being shown puts
     * itself on the map, and a card that already is opens step by step. The
     * name changes with it, so it always says what pressing will do.
     */
    showOnMap: string;
    viewDetails: string;
    /** Leaves the detail panel and returns to the list of results. */
    backToResults: string;
    /** Heading of the detail panel. */
    journeyDetails: string;
    /**
     * Names the origin and destination nodes of the strip map, for a screen
     * reader. Not shown: the two ends are drawn with the same markers the form
     * uses, and the line beneath a node is where the place itself is described.
     */
    startPoint: string;
    endPoint: string;
    /** A dropped pin nobody named — a coordinate, and nothing to call it. */
    selectedLocation: string;
    /** Closes the card offering a pressed point, without taking it. */
    dismiss: string;
    /** What pressing a point on the map offers to do with it. */
    setAsOrigin: string;
    setAsDestination: string;
    /** While the geocoder is being asked what is at that point. */
    namingPlace: string;
    /**
     * Totals shown with an itinerary.
     *
     * Verbs rather than gerunds — "Walk 11 min", not "Walking 11 min". They sit
     * in a row of short labelled figures, where the shorter word reads as the
     * heading it is.
     */
    totalWalking: string;
    totalWaiting: string;
    totalRiding: string;
    /** One overview card's summary line, read by a screen reader. */
    journeySummary: string;

    /* The planner depends on a backend that may not be running. */
    serviceUnavailable: string;
    serviceUnavailableHint: string;
    retryConnection: string;
    checkingService: string;
  };

  /**
   * Stop inspection: who a stop is, what leaves it next, and its whole day.
   *
   * A sibling of `planner` rather than part of it, because the same panel is
   * read from inside the planner and from its own page, and neither owns it.
   */
  stops: {
    /** The index, where a stop has not been chosen yet. */
    browseHint: string;
    /** Moves the map to the visitor, on a press and never on load. */
    nearMe: string;
    /** Sends the map back to the view the page opens on. */
    cityCentre: string;
    /** Filtering the stops in view: every mode is on until switched off. */
    filterByMode: string;
    /** Every mode that could show one has been switched off. */
    noMatchingStops: string;
    /** Switches every mode back on. */
    showAllModes: string;
    /** Shown when the map is pulled out past the zoom that draws stops. */
    zoomInForStops: string;
    /** The list of stops currently on screen. */
    visibleStops: Message;
    /** No stops in view even though the map is close enough to draw them. */
    noStopsHere: string;

    /** The panel's back control. Its target differs by where it is read. */
    backToResults: string;
    backToStops: string;
    /** Back to the itinerary that was open behind the stop. */
    backToJourney: string;

    loadingStop: string;

    /* The stop itself. */
    stopCode: string;
    fareZone: string;
    /** Tri-state, and the third is not a softer "no" — nobody published it. */
    wheelchairAccessible: string;
    wheelchairNotAccessible: string;
    wheelchairUnknown: string;

    /* The two views. */
    upcoming: string;
    timetable: string;
    /** Names the pair as a group for a screen reader. */
    viewLabel: string;

    /* The live board. */
    asOf: string;
    /**
     * How long until it leaves. A plural message: English needs two forms and
     * Arabic six, and `if (n === 1)` cannot express either.
     */
    inMinutes: Message;
    /** Under a minute away — a number here would tick to zero and stay. */
    dueNow: string;
    /** Read by a screen reader in place of the countdown's bare number. */
    departsIn: Message;
    noUpcoming: string;
    noUpcomingHint: string;
    /** Announced when a board finishes loading, so the change is not silent. */
    boardAnnouncement: Message;

    /* One departure. */
    /** The destination we inferred rather than read off the vehicle. */
    towards: string;
    /** The trip ends here, so there is no onward destination to name. */
    terminatesHere: string;
    /** Its arrival, where a vehicle waits before leaving again. */
    arrivesAt: string;
    /** A departure falling on a different day from the one being viewed. */
    onDate: string;

    /* The whole day. */
    date: string;
    departureCount: Message;
    /** The feed covers a fixed window; this date is outside it entirely. */
    outsideTimetableRange: string;
    outsideTimetableRangeHint: string;
    /** Inside the window, but nothing calls here that day. */
    noDeparturesToday: string;

    /* Filtering. */
    filterByLine: string;
    clearFilter: string;
    /** Every line is filtered out, which is the reader's own doing. */
    noMatchingLines: string;

    /* Onward. */
    departFromHere: string;
    arriveHere: string;
  };

  /**
   * Travel-card inquiry: type the number printed on a card, get its balance.
   *
   * Deliberately not behind sign-in. Somebody standing at a machine wanting to
   * know whether they can board does not have an account, and asking them to
   * make one is asking the wrong question.
   */
  card: {
    inquiryTitle: string;
    inquiryIntro: string;
    /** Labels the field. The format goes in the hint, not in the label. */
    numberLabel: string;
    /** The shape of the number, shown under the field and never as a label. */
    numberHint: string;
    check: string;
    checking: string;

    /* What comes back. */
    balance: string;
    lastUsed: string;
    neverUsed: string;
    /** Zero is a balance, not an absence, and says something worth acting on. */
    emptyCard: string;
    checkAnother: string;

    /* What went wrong, in the reader's terms rather than the server's. */
    numberRequired: string;
    numberIncomplete: string;
    notFound: string;
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
    /**
     * Distinct from `originStopNotFound`. That one blames a *starting* point,
     * which is nonsense on a stop page where nothing is being planned yet.
     */
    stopNotFound: string;
  };
}
