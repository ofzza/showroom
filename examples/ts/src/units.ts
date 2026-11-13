/**
 * Units of time, and how many milliseconds each one holds
 */

/**
 * Represents a unit of time
 */
export enum Unit {
  Millisecond = 'millisecond',
  Second = 'second',
  Minute = 'minute',
  Hour = 'hour',
  Day = 'day',
  Week = 'week',
}

/**
 * How many milliseconds each unit holds
 */
export const MILLISECONDS: Readonly<Record<Unit, number>> = {
  [Unit.Millisecond]: 1,
  [Unit.Second]: 1000,
  [Unit.Minute]: 60 * 1000,
  [Unit.Hour]: 60 * 60 * 1000,
  [Unit.Day]: 24 * 60 * 60 * 1000,
  [Unit.Week]: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Every unit, the largest first
 */
export const UNITS: readonly Unit[] = [Unit.Week, Unit.Day, Unit.Hour, Unit.Minute, Unit.Second, Unit.Millisecond];
