/**
 * Durations: lengths of time, added up, converted and broken down into units
 */

import { MILLISECONDS, UNITS, Unit } from './units.js';

/**
 * Represents a duration broken down into units, e.g. `{ day: 1, hour: 2 }`
 */
export type DurationParts = Partial<Record<Unit, number>>;

/**
 * Represents a length of time
 */
export class Duration {
  /**
   * @param milliseconds Length of the duration, in milliseconds
   */
  private constructor(public readonly milliseconds: number) {}

  /**
   * Creates a duration of an amount of a unit
   * @param amount How many of the unit
   * @param unit The unit
   * @returns The duration
   */
  public static of(amount: number, unit: Unit): Duration {
    return new Duration(amount * MILLISECONDS[unit]);
  }

  /**
   * Creates the duration between two dates, negative when `to` comes first
   * @param from The start
   * @param to The end
   * @returns The duration
   */
  public static between(from: Date, to: Date): Duration {
    return new Duration(to.getTime() - from.getTime());
  }

  /**
   * Adds another duration to this one
   * @param other The duration to add
   * @returns The sum
   */
  public plus(other: Duration): Duration {
    return new Duration(this.milliseconds + other.milliseconds);
  }

  /**
   * Converts the duration to a unit
   * @param unit The unit
   * @returns How many of the unit the duration holds, with a fraction
   */
  public to(unit: Unit): number {
    return this.milliseconds / MILLISECONDS[unit];
  }

  /**
   * Breaks the duration down into whole units, the largest first, leaving out units it holds none of
   * @param units The units to break it down into
   * @returns The parts
   */
  public parts(units: readonly Unit[] = UNITS): DurationParts {
    const parts: DurationParts = {};
    let rest = Math.abs(this.milliseconds);
    for (const unit of units) {
      const amount = Math.floor(rest / MILLISECONDS[unit]);
      if (amount) {
        parts[unit] = amount;
        rest -= amount * MILLISECONDS[unit];
      }
    }
    return parts;
  }

  /**
   * Formats the duration in words, e.g. "1 day, 2 hours"
   * @param units The units to break it down into
   * @returns The duration in words
   */
  public format(units: readonly Unit[] = UNITS): string {
    const words = Object.entries(this.parts(units)).map(([unit, amount]) => `${amount} ${unit}${amount === 1 ? '' : 's'}`);
    return words.length ? words.join(', ') : `0 ${units[units.length - 1]}s`;
  }
}
