import type { Dictionary } from './dictionary';

export const en: Dictionary = {
  app: {
    title: 'Journey Planner',
  },
  language: {
    switcherLabel: 'Language',
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
};
