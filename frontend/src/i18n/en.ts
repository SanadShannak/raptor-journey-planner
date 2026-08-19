/**
 * English UI strings.
 *
 * There is no i18n library yet and no locale switching — this module exists so
 * that user-facing text never gets written inline in a component. When Arabic
 * is added, this file becomes one of several locale dictionaries behind a
 * lookup, and no component has to be rewritten to find its strings.
 */

export const en = {
  app: {
    title: 'Journey Planner',
  },
  status: {
    checkingBackend: 'Contacting the routing service…',
    backendReachable: 'Routing service reachable.',
    backendUnreachable: 'Routing service unavailable.',
    availableDates: 'Timetable data covers {count} days, from {first} to {last}.',
  },
} as const;

export type Strings = typeof en;
