import type { Dictionary } from './dictionary';

export const en: Dictionary = {
  app: {
    title: 'Journey Planner',
  },
  language: {
    switcherLabel: 'Language',
  },
  theme: {
    switcherLabel: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  status: {
    checkingBackend: 'Contacting the routing service…',
    backendReachable: 'Routing service reachable.',
    backendUnreachable: 'Routing service unavailable.',
    availableDates: {
      one: 'Timetable data covers one day, {first}.',
      other: 'Timetable data covers {count} days, from {first} to {last}.',
    },
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
  },
};
