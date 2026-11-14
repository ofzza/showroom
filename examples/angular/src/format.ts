/**
 * Formatting elapsed times, as minutes, seconds and hundredths
 */

/**
 * Formats an elapsed time as `mm:ss.cc`
 * @param milliseconds The elapsed time, in milliseconds
 * @returns The formatted time
 */
export function formatElapsed(milliseconds: number): string {
  const hundredths = Math.floor(milliseconds / 10);
  const minutes = Math.floor(hundredths / 6000);
  const seconds = Math.floor(hundredths / 100) % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}.${pad(hundredths % 100)}`;
}
