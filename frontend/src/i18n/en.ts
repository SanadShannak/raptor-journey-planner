import type { Dictionary } from './dictionary';

export const en: Dictionary = {
  common: {
    scheduleEstimateNotice:
      'Times and locations are estimates from the published timetable, not live tracking — actual times may differ.',
  },
  app: {
    title: 'Journey Planner',
  },
  language: {
    switcherLabel: 'Language',
  },
  theme: {
    switcherLabel: 'Appearance',
    switchToLight: 'Switch to light theme',
    switchToDark: 'Switch to dark theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  status: {
    checkingBackend: 'Contacting the routing service…',
    backendReachable: 'Routing service reachable.',
    backendUnreachable: 'Routing service unavailable.',
    clockLabel: 'Time in {network}',
    loadingPage: 'Loading…',
    availableDates: {
      one: 'Timetable data covers one day, {first}.',
      other: 'Timetable data covers {count} days, from {first} to {last}.',
    },
    resultsUnavailable: "Results can't be loaded right now.",
  },

  units: {
    minutes: '{minutes} min',
    hours: '{hours} h',
    hoursMinutes: '{hours} h {minutes} min',
    meters: '{meters} m',
    kilometers: '{kilometers} km',
  },
  modes: {
    tram: 'Tram',
    metro: 'Metro',
    rail: 'Train',
    bus: 'Bus',
    ferry: 'Ferry',
    cableTram: 'Cable tram',
    aerialLift: 'Cable car',
    funicular: 'Funicular',
    trolleybus: 'Trolleybus',
    monorail: 'Monorail',
    unknown: 'Transit',
  },
  errors: {
    generic: 'Something went wrong. Try again.',
    network: 'Cannot reach the routing service. Check your connection, then try again.',
    timeout: 'The routing service took too long to answer. Try again.',
    malformed: 'The routing service sent a response this app could not read.',
    serverError: 'The routing service ran into a problem. Try again in a moment.',
    rateLimited: 'Too many attempts in a short time. Wait a minute, then try again.',
    requestBlocked: 'This request was blocked as automated. If that is a mistake, try again in a moment.',
    missingOrigin: 'Choose a starting point.',
    missingDestination: 'Choose a destination.',
    badDate: 'That date is not valid. Pick another one.',
    badTime: 'That time is not valid. Pick another one.',
    sameOriginTarget: 'The start and the destination are the same place. Choose two different points.',
    noActiveServices: 'Nothing runs on that date. Try another day.',
    originOutOfBounds: 'The starting point is outside the area this timetable covers.',
    originStopNotFound: 'That starting stop is not in the timetable.',
    destinationOutOfBounds: 'The destination is outside the area this timetable covers.',
    destinationStopNotFound: 'That destination stop is not in the timetable.',
    stopNotFound: 'No stop with that identifier is in this timetable.',
    cardNotFound: 'No card has that number. Check the digits and try again.',
    badCardNumber: 'That is not a card number. A card number has eleven digits.',
    cardStoreUnavailable: 'Balance checks are unavailable right now. Everything else still works.',

    unauthorized: 'You have been signed out. Log in again to carry on.',
    emailInUse: 'An account with that email already exists. Log in instead.',
    invalidCredentials: 'That email and password do not match an account.',
    invalidSubmission: 'Check the details you entered and try again.',
    insufficientBalance: 'There is not enough on this card. Top it up first.',
    invalidAmount: 'That amount is not valid. Use digits, with up to three decimal places.',
    cardLimitReached: 'You already have as many cards as an account can hold. Delete one to make room.',
    cardHasBalance: 'This card still has money on it. Spend or move the balance before deleting it.',
    duplicateCardNickname: 'Another of your cards already has that name. Pick a different one.',
    alreadySaved: 'That is already in your favourites.',
    duplicateNickname: 'Another favourite already has that name. Pick a different one.',
    savedLimitReached: 'You have saved as many of these as an account can hold. Remove one to make room.',
    savedItemNotFound: 'That is no longer there. It may have been removed already.',
    invalidToken: 'This link has expired or was already used.',
    emailUnavailable: 'We could not send the email just now. Try again in a few minutes.',
  },

  nav: {
    sectionsLabel: 'Sections',
    primaryLabel: 'Main',
    skipToContent: 'Skip to content',
    openMenu: 'Menu',
    back: 'Back',
    closeMenu: 'Close',
    home: 'Home',
    plan: 'Planner',
    routes: 'Routes',
    stops: 'Stops',
    card: 'Travel card',
    favourites: 'Favourites',
  },
  pages: {
    home: {
      title: 'Journey Planner',
      tagline: 'Plan a journey, browse the network, and read any stop’s timetable.',
      planCard: 'Plan a journey',
      planCardBody: 'Departure times, changes, and how far you walk at each end.',
      routesCard: 'Browse routes',
      routesCardBody: 'Every route, where it runs, and the stops it calls at.',
      stopsCard: 'Find a stop',
      stopsCardBody: 'What leaves from a stop, on any day the timetable covers.',
      cardCard: 'Travel card',
      cardCardBody: 'Add a card, top it up, and see what has been spent.',
    },
    plan: { title: 'Plan a journey', documentTitle: 'Itinerary Planner' },
    routes: { title: 'Routes', documentTitle: 'Routes' },
    stops: { title: 'Stops', documentTitle: 'Stops' },
    card: { title: 'Travel cards' },
    favourites: { title: 'Favourites', documentTitle: 'Favourites' },
    notFound: {
      title: 'Page not found',
      body: 'That address does not match anything on this site. It may have moved, or the link may be mistyped.',
      backHome: 'Go to the home page',
    },
  },
  planner: {
    origin: 'From',
    destination: 'To',
    originPlaceholder: 'Address, place, or stop',
    destinationPlaceholder: 'Address, place, or stop',
    swap: 'Swap start and destination',
    useMyLocation: 'Use my location',
    locating: 'Finding your location…',
    locationDenied: 'Location permission was declined. Search for a place instead.',
    locationUnavailable: 'Your location could not be found. Search for a place instead.',
    myLocation: 'My location',
    date: 'Date',
    time: 'Time',
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
    chooseTime: 'Choose a time',
    leaveNow: 'Leave now',
    hour: 'Hour',
    minute: 'Minute',
    meridiem: 'Morning or afternoon',
    am: 'AM',
    pm: 'PM',
    done: 'Done',
    walkingSpeed: 'Walking speed',
    speedSlow: 'Slow',
    speedCalm: 'Calm',
    speedAverage: 'Average',
    speedFast: 'Fast',
    submit: 'Find a journey',
    kmh: '{value} km/h',
    searching: 'Searching…',
    searchingHint: 'Looking for the best way across the network.',
    suggestionsAvailable: {
      one: 'One suggestion. Use the arrow keys to review it.',
      other: '{count} suggestions. Use the arrow keys to review them.',
    },
    searchUnavailable: 'Place search is unavailable right now. Try again shortly.',
    isStop: 'Transit stop',
    platform: 'Platform {platform}',
    track: 'Track {platform}',
    chooseOrigin: 'Choose a starting point from the suggestions.',
    chooseDestination: 'Choose a destination from the suggestions.',
    noJourney: 'No journey found',
    noJourneyHint: 'Nothing connects these two places at that time. Try a different time, or a nearby starting point.',
    resultsFound: {
      one: 'One journey found.',
      other: '{count} journeys found.',
    },
    departAt: 'Departs',
    arriveAt: 'Arrives',
    totalDuration: 'Total',
    changes: {
      zero: 'No changes',
      one: 'One change',
      other: '{count} changes',
    },
    later: 'Later',
    noLater: 'No later journey was found.',
    walk: 'Walk',
    transitLeg: '{mode} {line}',
    towards: 'Towards {destination}',
    wait: 'Wait {duration}',
    waitHere: 'Wait {duration} at {place}',
    intermediateStops: {
      one: 'One stop on the way',
      other: '{count} stops on the way',
    },
    showStops: 'Show stops',
    hideStops: 'Hide stops',
    arrivesNextDay: 'Arrives {date}',
    departsOnDate: 'Departs {date}',
    walkOnly: 'Walking the whole way is faster than waiting for a service.',
    mapLabel: 'Map of the journey',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    mapUnavailableTitle: 'The map cannot be shown here',
    mapUnavailableBody:
      'This browser does not support the graphics the map is drawn with. Everything the map would show is listed beside it.',

    showOnMap: 'Show this journey on the map',
    viewDetails: 'Show this journey step by step',
    backToResults: 'Back to results',
    journeyDetails: 'Journey details',
    startPoint: 'Start',
    endPoint: 'Destination',
    selectedLocation: 'Selected location',
    dismiss: 'Dismiss',
    setAsOrigin: 'Start here',
    setAsDestination: 'End here',
    namingPlace: 'Looking up this place…',
    totalWalking: 'Walk {duration} · {distance}',
    totalWaiting: 'Wait {duration}',
    totalRiding: 'Ride {duration}',
    journeySummary: 'Departs {start}, arrives {end}, {duration}.',

    retryConnection: 'Try again',
    checkingService: 'Checking the routing service…',
  },

  stops: {
    documentTitle: 'Stop {name}',
    documentTitleWithCode: 'Stop {name} · {code}',
    browseHint: 'Every stop in view is listed here. Press one to see what leaves it.',
    nearMe: 'Near me',
    cityCentre: 'City centre',
    filterByMode: 'Modes',
    noMatchingStops: 'No stop in view is served by the modes you have left on. Try moving the map, or switching a mode back on.',
    showAllModes: 'Show all modes',
    loadingStops: 'Finding stops…',
    zoomInForStops: 'Zoom in to see stops',
    sampledStops:
      'Too many stops here to list them all — showing a selection. Zoom in for the rest.',
    visibleStops: { one: '{count} stop in view', other: '{count} stops in view' },
    noStopsHere: 'No stops in this part of the map.',

    backToResults: 'Back to results',
    backToStops: 'Back to stops',
    backToJourney: 'Back to the journey',
    backToStop: 'Back to the stop',

    loadingStop: 'Loading this stop…',

    stopCode: 'Stop {code}',
    fareZone: 'Zone {zone}',
    wheelchairAccessible: 'Step-free access',
    wheelchairNotAccessible: 'No step-free access',
    wheelchairUnknown: 'Step-free access not stated',

    upcoming: 'Upcoming',
    timetable: 'Timetable',
    viewLabel: 'What to show',

    asOf: 'As of {time}',
    inMinutes: { one: '{count} min', other: '{count} min' },
    dueNow: 'Due',
    departsIn: { one: 'Departs in {count} minute', other: 'Departs in {count} minutes' },
    noUpcoming: 'Nothing more today',
    noUpcomingHint: 'No further departures are scheduled from this stop. Try the timetable for another day.',
    boardAnnouncement: {
      one: '{count} upcoming departure.',
      other: '{count} upcoming departures.',
    },

    towards: 'Towards {destination}',
    terminatesHere: 'Terminates here',
    arrivesAt: 'Arrives {time}',
    onDate: 'on {date}',

    date: 'Date',
    departureCount: { one: '{count} departure', other: '{count} departures' },
    outsideTimetableRange: 'That date is outside this timetable',
    outsideTimetableRangeHint: 'The loaded feed covers a fixed window of dates. Pick one inside it.',
    noDeparturesToday: 'Nothing calls at this stop on that date.',

    filterByLine: 'Routes',
    clearFilter: 'Show all routes',
    noMatchingLines: 'No departures match the routes you picked.',

  },

  routes: {
    documentTitle: 'Route {line}',
    browseHint: 'Pick a route to see where it goes and when it runs.',
    searchLines: 'Search routes',
    searchPlaceholder: 'Number or destination',
    noMatchingLines: 'No routes match that search.',
    clearSearch: 'Show all routes',
    lineCount: {
      one: 'One route.',
      other: '{count} routes.',
    },
    variantCount: {
      one: '1 variant',
      other: '{count} variants',
    },
    activeToday: 'Active today',
    loadingLines: 'Loading routes…',

    backToLines: 'All routes',
    backToLine: 'Back to the route',
    loadingLine: 'Loading route…',

    originToTerminus: '{origin} to {terminus}',
    flipDirection: 'Show the other direction',
    stopCount: {
      one: '1 stop',
      other: '{count} stops',
    },
    tripCountToday: {
      one: '1 trip today',
      other: '{count} trips today',
    },
    tripCountOnDate: {
      one: '1 trip on {date}',
      other: '{count} trips on {date}',
    },
    spanToday: 'Runs {first} to {last} today',
    spanOnDate: 'Runs {first} to {last} on {date}',
    notRunningToday: 'This route does not run today.',
    notRunningTodayHint: 'Open the timetable to pick a day it does.',
    serviceRange: 'Runs {from} to {to}',
    noServiceDays: 'No service days',

    alternativeRoutes: 'Alternative variants',
    showAlternatives: 'Show alternative variants',
    hideAlternatives: 'Hide alternative variants',
    currentVariant: 'Showing now',
    runningNow: 'Running now',
    runsOnOtherDays: 'Runs on other days',
    startingLater: 'Future',
    noLongerRunning: 'No longer running',
    towards: 'Towards {destination}',

    stopsView: 'Stops',
    timetableView: 'Timetable',
    viewLabel: 'What to show about this route',
    date: 'Service day',

    inspectStop: 'Open {stop}',
    nextDeparture: 'Next departure',
    noMoreToday: 'Nothing more today',
    noCallHere: 'Does not call that day',
    notOnThisRun: 'Not on this run',
    followingRun: 'Following one trip of this route.',
    followingRunTowards: 'Following one trip, towards {destination}.',
    showWholeLine: 'Show the whole route',
    followThisRun: 'Follow this vehicle’s trip',
    vehicleHere: 'A vehicle is due at this stop now.',
    vehicleLeaving: 'A vehicle is due to be on its way from this stop.',
    dayAnnouncement: {
      one: 'One trip on this day.',
      other: '{count} trips on this day.',
    },

    fromStop: 'From',
    toStop: 'To',
    departs: 'Departs',
    arrives: 'Arrives',
    noOnwardStops: 'This is the end of the route, so there is nowhere further along to travel to. Pick an earlier stop.',
    noTripsToday: 'This route does not run on the day you picked.',
    outsideTimetableRange: 'Outside the timetable',
    outsideTimetableRangeHint: 'The loaded timetable does not reach that far. Pick a day inside it.',
    tripsBetween: {
      one: 'One trip between these stops.',
      other: '{count} trips between these stops.',
    },
    alreadyDeparted: 'Already gone',
  },

  card: {
    walletTitle: 'Your travel cards',
    walletIntro: 'Add a card, top it up, and see what has been spent on it. Cards belong to your account, so they are the same on every device you sign in on.',
    numberLabel: 'Card number',

    addTitle: 'Add a card',
    nicknameLabel: 'Name',
    nicknamePlaceholder: 'Home card, Work card…',
    nicknameRequired: 'Give the card a name.',
    typeLabel: 'Type',
    types: {
      Standard: 'Standard',
      Student: 'Student',
      Elderly: 'Senior',
    },
    add: 'Add card',
    adding: 'Adding…',

    topUpLabel: 'Top-up amount',
    topUpAction: 'Top up',
    topUpPending: 'Topping up…',
    fareLabel: 'Fare amount',
    fareAction: 'Pay fare',
    farePending: 'Paying…',
    amountHint: 'Amounts take up to {places} decimal places, and at least {minimum}.',
    amountRequired: 'Enter an amount.',
    amountMalformed: 'Enter an amount in digits, with up to three decimal places.',
    amountTooSmall: 'That amount is too small.',

    discard: 'Delete card',
    discardTitle: 'Delete {name}?',
    discardWarning: 'The card and everything recorded on it are removed for good. Enter your password to confirm.',
    discardPasswordLabel: 'Your password',
    discardNeedsEmpty: 'Spend or move the remaining balance before deleting this card.',
    discardYes: 'Delete card',
    discardPending: 'Deleting…',
    discardNo: 'Cancel',

    balance: 'Balance',
    lastUsed: 'Last used {date}',
    neverUsed: 'Not used yet',
    emptyCard: 'This card is empty. Top it up before you travel.',
    balanceNow: 'Balance is now {amount}.',

    activity: 'Recent activity',
    fare: 'Fare',
    topUp: 'Top-up',
    noActivity: 'Nothing recorded on this card yet.',
    unknownPlace: 'Journey',

    myCardsTitle: 'My cards',
    noCards: 'No cards yet. Add one and its number will be issued for you.',
    loadingCards: 'Loading your cards…',
    limitReached: 'You can have {count} cards. Delete one to make room.',
    rename: 'Rename',
    renameNamed: 'Rename {name}',
    refreshBalance: 'Refresh balance',
  },

  favourites: {
    add: 'Add to favourites',
    remove: 'Remove from favourites',
    needsSearch: 'Fill in the whole search before saving it.',
    limitReached: 'You can save {count} of each. Remove one to make room.',

    intro: 'Everything you have saved, and what leaves next.',
    savedToAccount: 'Favourites are saved to your account.',
    loadingSaved: 'Loading what you have saved…',
    noStops: 'No saved stops. Press the star on a stop to keep it here.',
    noRoutes: 'No saved routes. Press the star on a route to keep it here.',
    noItineraries: 'No saved journeys. Fill in a search and press the star beside it.',
    groupStops: 'Stops',
    groupRoutes: 'Routes',
    groupItineraries: 'Journeys',
    countOfLimit: '{count} of {limit}',

    journeyRoute: '{origin} to {destination}',
    openJourney: 'Search this journey now',
    paceLabel: 'Walking {pace}',

    rename: 'Rename',
    renameNamed: 'Rename {name}',
    renamePlaceholderStop: 'Home, Work, School…',
    renamePlaceholderRoute: 'Airport line, Night bus…',
    renamePlaceholderItinerary: 'Home to work, School run…',
    openNamed: 'Open {name}',
    moveEarlier: 'Move earlier',
    moveLater: 'Move later',
    dragHint: 'Drag to reorder, or hold Alt and press the arrow keys.',

    showEarlier: 'Show earlier departures',
    showMore: 'Show later departures',

    journeyFallback: 'Saved journey',
    savedOn: 'Saved {date}',
    fromLabel: 'From',
    toLabel: 'To',
    speedLabel: 'Walking',

    loadingDepartures: 'Loading departures…',
    noDepartures: 'Nothing more today.',
    directionUnavailable: 'This direction is no longer in the timetable. Open the route to pick another.',
    departuresUnavailable: 'Departures cannot be loaded right now.',
  },

  auth: {
    logIn: 'Log in',
    signUp: 'Sign up',
    close: 'Close',
    name: 'Name',
    email: 'Email',
    password: 'Password',
    submitLogIn: 'Log in',
    submitSignUp: 'Create account',
    submitting: 'Just a moment…',
    switchToSignUp: 'Need an account? Sign up',
    switchToLogIn: 'Already have an account? Log in',
    nameRequired: 'Enter your name.',
    nameInvalid: 'Use 3 to 20 letters, numbers or spaces.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter an email address, like name@example.com.',
    passwordRequired: 'Enter a password.',
    passwordTooShort: 'Use at least 8 characters.',
    forgot: 'Reset your password',
    forgotLink: 'Forgot your password?',
    forgotIntro: 'Enter the email you signed up with and we will send you a link to choose a new password.',
    submitForgot: 'Send reset link',
    forgotSent: 'If an account exists for {email}, a link to reset its password is on its way. It works for one hour.',
    backToLogIn: 'Back to log in',
  },
  verification: {
    bannerText:
      'Confirm your email address. We sent a link to {email}.',
    bannerResend:
      'Send a new link',
    bannerSending:
      'Sending…',
    bannerSent:
      'Sent. Check your inbox.',
    bannerDismiss:
      'Dismiss',
    verifyTitle:
      'Confirm your email',
    verifying:
      'Confirming your email…',
    verified:
      'Your email is confirmed.',
    verifiedHint:
      'Thank you — there is nothing else to do.',
    invalidLink:
      'This link has expired or was already used.',
    invalidVerifyHintSignedIn:
      'Send yourself a new one from the banner at the top of the page.',
    invalidVerifyHintSignedOut:
      'Log in, then ask for a new link from the banner at the top of the page.',
    missingToken:
      'This page needs the link from your email.',
    goHome:
      'Go to the planner',
    resetTitle:
      'Choose a new password',
    resetIntro:
      'Enter a new password for your account. It needs at least 8 characters.',
    newPassword:
      'New password',
    submitReset:
      'Save new password',
    resetDone:
      'Your password is changed and you are signed in.',
    resetInvalidHint:
      'Reset links work once, for one hour. Ask for a new one and use the newest email.',
    requestNewLink:
      'Send a new reset link',
  },
  tour: {
    open: 'Show the tour',
    dialogLabel: 'Tour',
    stepOf: 'Step {current} of {total}',
    next: 'Next',
    back: 'Back',
    done: 'Done',
    skip: 'Skip tour',
    plan: {
      welcomeTitle: 'Welcome to Journey Planner',
      welcomeBody:
        'A quick look around this page. It takes under a minute, and you can see it again any time from the ? button.',
      placesTitle: 'Where from, and where to',
      placesBody:
        'Type an address, a place or a stop and pick one of the suggestions. The target button fills in where you are now, and the arrows beside the fields swap start and end.',
      whenTitle: 'When you leave',
      whenBody:
        'Choose the day and the time you want to set off. “Leave now” fills in both.',
      paceTitle: 'How fast you walk',
      paceBody:
        'Your walking speed decides which changes you can make in time, so pick the one that is closest.',
      mapTitle: 'The map',
      mapBody:
        'Press anywhere on the map and this card appears: choose “Start here” or “End here” to use that spot. Press a stop to see what leaves from it. After a search, press a line on the drawn journey to follow that vehicle’s trip.',
      resultsTitle: 'Your journeys',
      resultsBody:
        'Press a journey once to show it on the map, and again to open it stop by stop. Inside, each ride opens that vehicle’s whole trip. “Later” finds the departures after these.',
      saveTitle: 'Keep it for later',
      saveBody:
        'The star saves this search to your favourites. Stops and routes have one too. Saving needs an account.',
      navTitle: 'Everything else',
      navBody:
        'Browse routes and stops, keep track of your travel card, and find your favourites from here. On a phone or tablet they are in the menu.',
    },
    itinerary: {
      stepsTitle: 'Your journey, step by step',
      stepsBody:
        'Every walk, wait and ride in order, with the time you reach each stop and the time you leave it.',
      stopTitle: 'Open a stop',
      stopBody:
        'Press an underlined stop name to see everything that leaves from it — handy for checking the platform or a later departure.',
      rideTitle: 'Follow a ride',
      rideBody:
        'Press a ride to open that vehicle’s whole trip: every stop it calls at, and where it is right now. The stop count under it lists the stops you pass on the way.',
      mapTitle: 'The journey on the map',
      mapBody:
        'Each ride is drawn in its own colour, with walks dotted between them. Press a coloured line to follow that vehicle, or a stop to see its departures.',
      backTitle: 'Back to the list',
      backBody:
        'Return to all the journeys found, to compare them or choose another.',
    },
    routes: {
      searchTitle: 'Find a route',
      searchBody:
        'Search by number or destination, and narrow the list down by type of transport.',
      listTitle: 'Every route in the network',
      listBody:
        'Press a route to open it. You can switch direction, see every stop it calls at, open its timetable, and watch where its vehicles are right now.',
      mapTitle: 'Routes on the map',
      mapBody:
        'The open route is drawn here, with its vehicles where they are right now. Press a vehicle to follow its trip, or a stop to see its departures.',
      detailTitle:
        'Inside a route',
      detailBody:
        'This is what opening a route shows: switch direction at the top, see every stop with its next departure, or change to the timetable for any day. Press a stop to see its departures.',
    },
    stops: {
      mapTitle: 'Stops on the map',
      mapBody:
        'Move and zoom the map to find stops — they appear once you are close enough, and every one in view is listed beside it.',
      nearbyTitle: 'Stops near you',
      nearbyBody:
        'Jump straight to the stops around where you are, or back to the city centre.',
      modesTitle: 'Only what you take',
      modesBody:
        'Show only the kinds of transport you use, so the map is easier to read.',
      detailTitle:
        'A stop’s board',
      detailBody:
        'This is what opening a stop shows: upcoming departures with how long until each, or the full timetable for any day. Filter by line, and press a departure to follow that vehicle.',
    },
    card: {
      introTitle: 'Your travel cards',
      introBody:
        'Keep your travel cards in one place. Press a card to see its balance and recent activity, top it up, pay a fare, or rename it.',
      addTitle: 'Add a card',
      addBody:
        'This is the form “Add a card” opens: give the card a name you will recognise and choose its type. The card number is issued for you.',
    },
    favourites: {
      introTitle: 'Everything you saved',
      introBody:
        'Stops, routes and journeys you starred appear here, with what leaves next.',
      rowsTitle: 'Make it yours',
      rowsBody:
        'Press a card to open the stop, route or journey it saved, or its name to rename it. The small arrows page through departures and × removes it. Drag the dots to put what you use most first.',
    },
  },
  account: {
    menuLabel: 'Your account',
    signedInAs: 'Signed in as',
    logOut: 'Log out',
    loggingOut: 'Logging out…',

    checking: 'Checking your account…',
    unreachable: 'We could not reach the server to check your account. Try again in a moment.',
    walletNeedsAccount: 'Log in to see your travel cards, top them up and check what has been spent.',
    favouritesNeedAccount: 'Log in to see the stops, lines and journeys you have saved.',
    restNeedsNoAccount:
      'Everything else works without an account — plan a journey, browse stops and lines, and check any timetable.',
    saveNeedsAccount: 'Log in to save this.',
  },
};
