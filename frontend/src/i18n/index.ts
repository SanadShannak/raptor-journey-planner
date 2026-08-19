import { en } from './en';

export type { Strings } from './en';

/**
 * The active dictionary. A single hard-coded locale for now; this is the seam
 * where locale selection (and RTL) will be introduced.
 */
export const strings = en;

/** Substitutes `{name}` placeholders in a string with the given values. */
export function format(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
