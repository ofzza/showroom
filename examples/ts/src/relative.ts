/**
 * Relative times: "3 hours ago", "in 2 days"
 */

import { Duration } from './duration.js';
import { UNITS, Unit } from './units.js';

/**
 * Formats a date relative to another one, in the largest unit that fits
 * @param date The date to format
 * @param now The date it is relative to
 * @param locale The language to format in
 * @returns The relative time, e.g. "3 hours ago"
 */
export function relative(date: Date, now: Date = new Date(), locale: string = 'en'): string {
  const duration = Duration.between(now, date);
  const unit = UNITS.find((unit) => unit !== Unit.Millisecond && Math.abs(duration.to(unit)) >= 1) ?? Unit.Second;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return format.format(Math.trunc(duration.to(unit)), unit as Exclude<Unit, Unit.Millisecond>);
}
