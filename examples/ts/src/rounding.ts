/**
 * Rounding numbers to a number of decimals, without floating point surprises
 */

/**
 * Represents a way of rounding
 */
export enum Rounding {
  /**
   * Halves away from zero: 2.5 to 3, -2.5 to -3
   */
  HalfUp = 'half-up',
  /**
   * Halves to the even neighbour (banker's rounding): 2.5 to 2, 3.5 to 4
   */
  HalfEven = 'half-even',
  /**
   * Towards zero: 2.9 to 2
   */
  Down = 'down',
}

/**
 * Rounds a number to a number of decimals
 * @param value The number
 * @param decimals How many decimals to keep
 * @param mode How to round
 * @returns The rounded number
 */
export function round(value: number, decimals: number, mode: Rounding = Rounding.HalfUp): number {
  const factor = 10 ** decimals;
  // Drop the floating point noise first, so that 1.005 * 100 (100.49999999999999) counts as the 100.5 it means
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  const whole = Math.floor(scaled);
  const fraction = scaled - whole;
  let rounded: number;
  switch (mode) {
    case Rounding.Down:
      rounded = whole;
      break;
    case Rounding.HalfEven:
      rounded = fraction > 0.5 || (fraction === 0.5 && whole % 2 === 1) ? whole + 1 : whole;
      break;
    case Rounding.HalfUp:
      rounded = fraction >= 0.5 ? whole + 1 : whole;
      break;
  }
  return (Math.sign(value) * rounded) / factor;
}

/**
 * Checks if two numbers are equal, give or take floating point noise
 * @param a A number
 * @param b Another number
 * @returns Whether they are equal
 */
export function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}
