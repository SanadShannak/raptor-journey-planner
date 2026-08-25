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
    /**
     * A back control with nowhere specific to name.
     *
     * The first hop back can say where it goes, because whoever sent you said
     * so. Three levels in it cannot, and inventing a name for "the run behind
     * the stop behind the run" is worse than the plain word.
     */
    back: string;
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
    /**
     * A page's own name, and the name of the tab showing it.
     *
     * They are not always the same string and the difference is the point. A
     * heading is an invitation — "Plan a journey" — while a tab is one of
     * fifteen and has to say *what it is* from three words seen sideways.
     * Where a page shows one particular thing, the tab names that thing rather
     * than the page it is on.
     */
    plan: { title: string; documentTitle: string };
    routes: { title: string; documentTitle: string };
    stops: { title: string; documentTitle: string };
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
    /**
     * Names the tab when one stop is being read: "Stop Vuosaari · V1502".
     *
     * Two forms because the code is what tells six stops called "Pasila"
     * apart, and a feed that publishes none must not leave a dangling
     * separator in a browser tab.
     */
    documentTitle: string;
    documentTitleWithCode: string;
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
    /** Back to a stop's board, which is what was behind this. */
    backToStop: string;

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
    /** When it pulls in, shown only where that differs from when it leaves. */
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

  };

  /**
   * Line inspection: where a line goes, when it calls, and what it costs in
   * time between any two of its stops.
   *
   * A sibling of `stops` rather than part of it. The two are read from opposite
   * ends of the same data — a stop asks what passes through it, a line asks
   * where it passes — and the words differ accordingly.
   */
  routes: {
    /** Names the tab when one line is being read: "Route M1". */
    documentTitle: string;
    /* The index, where a line has not been chosen yet. */
    browseHint: string;
    /** Labels the search field. Says what it searches, not what it might. */
    searchLines: string;
    /** Placeholder, on top of the label and never instead of one. */
    searchPlaceholder: string;
    /** Nothing in the feed matches what was typed or ticked. */
    noMatchingLines: string;
    /** Clears the query and every mode at once. */
    clearSearch: string;
    /** How many lines the index is showing. */
    lineCount: Message;
    /**
     * How many stop sequences a line runs — its directions and short workings.
     * "Route" rather than "variant": the word a rider would use.
     */
    variantCount: Message;
    loadingLines: string;

    /* The panel's back control, and the places it can name. */
    backToLines: string;
    /** Back to a line, which is what was behind this. */
    backToLine: string;
    loadingLine: string;

    /* The line itself. */
    /**
     * Where the variant on screen runs, from end to end.
     *
     * One message rather than two labels and an arrow between them: word order
     * differs between languages and an assembled sentence cannot follow it.
     */
    originToTerminus: string;
    /** Turns the page around to the same line going the other way. */
    flipDirection: string;
    /** How many stops this variant calls at. */
    stopCount: Message;
    /** How many times it runs, across every service day. */
    tripCount: Message;
    /**
     * When the first and last vehicle leave the origin **today**.
     *
     * The day's own span, not the pattern's lifetime one. Beside a date, a
     * lifetime span reads as a claim about that date — and on a line whose
     * weekend service is shorter it is a wrong one.
     */
    spanToday: string;
    /** The same, for a day that is not today, which therefore says which. */
    spanOnDate: string;
    /** The line does not run at all on the day being looked at. */
    notRunningToday: string;
    /** Points at the timetable, where another day can be chosen. */
    notRunningTodayHint: string;
    /**
     * The calendar range a variant runs over — dates, not times. What tells a
     * seasonal short working from the everyday service.
     */
    serviceRange: string;
    /** A variant the feed's calendar says nothing about. */
    noServiceDays: string;

    /* The other patterns of the same line. */
    /**
     * A line is one designation over several stop sequences: two directions,
     * and often short workings that turn back early. Riders think of those as
     * the same line, so they are offered as alternatives rather than as
     * separate lines in the index.
     */
    alternativeRoutes: string;
    showAlternatives: string;
    hideAlternatives: string;
    /** The variant currently on screen, so the list says where you are. */
    currentVariant: string;
    /* Variants grouped by whether they run on the day being looked at. */
    runningNow: string;
    /** Not running yet — its first service day is still ahead. */
    startingLater: string;
    noLongerRunning: string;
    /** A variant named by its sign, when the feed carries one. */
    towards: string;

    /* The two views. */
    stopsView: string;
    timetableView: string;
    /** Names the pair as a group for a screen reader. */
    viewLabel: string;
    /** Exactly the days this line runs, which is fewer than the feed covers. */
    date: string;

    /* The stops along the line. */
    /** Read by a screen reader for the row's link: it opens the stop. */
    inspectStop: string;
    /** The next vehicle to leave this stop, on the day being looked at. */
    nextDeparture: string;
    /** Nothing more leaves this stop today; the day is not over elsewhere. */
    noMoreToday: string;
    /** Nothing calls at this stop on the chosen day at all. */
    noCallHere: string;
    /** Following one run: this vehicle passes without stopping here. */
    notOnThisRun: string;
    /* Following one run of the line rather than the line itself. */
    followingRun: string;
    followingRunTowards: string;
    showWholeLine: string;
    /** Names the vehicle badge for anyone who cannot see it. */
    followThisRun: string;
    /*
     * The vehicles drawn on the spine and the map, for a reader who gets
     * neither. Found by moving through the list, never announced — a position
     * that changes every few seconds has no business interrupting anyone.
     */
    vehicleHere: string;
    vehicleLeaving: string;
    /** Says the drawing is the timetable's word, not a live feed's. */
    scheduledPositions: string;
    /** Announced when a day's times arrive, so the change is not silent. */
    dayAnnouncement: Message;

    /* From one stop of the line to another. */
    /** Labels the origin field of the timetable. */
    fromStop: string;
    /** Labels the destination field, which offers only stops further along. */
    toStop: string;
    /** Column heading: when a trip leaves the chosen origin. */
    departs: string;
    /** Column heading: when it reaches the chosen destination. */
    arrives: string;
    /** The origin is the last stop, so there is nothing to travel to. */
    noOnwardStops: string;
    /** Inside the feed's window, but this line does not run that day. */
    noTripsToday: string;
    /** The date falls outside the feed's calendar entirely. */
    outsideTimetableRange: string;
    outsideTimetableRangeHint: string;
    /** How many trips make the chosen pair of stops that day. */
    tripsBetween: Message;
    /** A trip that has already left, on a board being read today. */
    alreadyDeparted: string;
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

    /* What has happened to the balance. */
    activity: string;
    fare: string;
    topUp: string;
    /** A card nobody has used, and a card whose history was never kept. */
    noActivity: string;
    /** A tap with a date but nothing said about where. */
    unknownPlace: string;

    /* What went wrong, in the reader's terms rather than the server's. */
    numberRequired: string;
    numberIncomplete: string;
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
    /** A number nobody holds — usually a mistyped digit rather than a fault. */
    cardNotFound: string;
    badCardNumber: string;
    /** The card store is down. Nothing else in the app depends on it. */
    cardStoreUnavailable: string;
  };
}
