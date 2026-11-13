/**
 * A countdown to the next new year, with tempo's durations
 */

import { Duration } from '../src/duration.js';
import { Unit } from '../src/units.js';

const now = new Date();
const target = new Date(now.getFullYear() + 1, 0, 1);
console.info(`Counting down to ${target.toDateString()}`);

const root = document.getElementById('root')!;
const heading = document.createElement('p');
heading.textContent = `Until ${target.getFullYear()}:`;
const display = document.createElement('p');
display.style.fontSize = '1.5rem';
display.style.fontVariantNumeric = 'tabular-nums';
root.append(heading, display);

const tick = (): void => {
  const left = Duration.between(new Date(), target);
  display.textContent = left.format([Unit.Day, Unit.Hour, Unit.Minute, Unit.Second]);
};
tick();
setInterval(tick, 1000);
console.log('Days left', Math.floor(Duration.between(now, target).to(Unit.Day)));
