# `tempo`

> A made-up TypeScript library, and the `ts` showcase adapter's example: this is how a host repository could document its TypeScript with `showroom`. See [`README.md` › `ts` showcases](../../README.md#ts-showcases) for what a `ts` showcase can do.

`tempo` measures time and rounds numbers, typed throughout: units are an `enum`, durations a class, and roundings an `enum` again. Its files are real ones, in [`src/`](./src/units.ts), type checked with this folder's own [`tsconfig.json`](./tsconfig.json), the nearest one to this documentation file.

## A countdown

A linked showcase, shown as a block beside its code: [`demo/countdown.ts`](./demo/countdown.ts) imports the library like any module would, and writes into the showcase frame root, `#root`. What it logs fades in at the bottom of its showcase frame, and the counter in its corner opens the console panel.

[A countdown to the new year](./demo/countdown.ts 'showcase=ts block')

## Durations

A code block showcase, importing the library by relative paths from this documentation file's folder. Everything it logs shows in the console panel.

```ts showcase=ts
import { Duration } from './src/duration.js';
import { Unit } from './src/units.js';

const sprint: Duration = Duration.of(2, Unit.Week);
const meeting: Duration = Duration.of(90, Unit.Minute);

console.log('A sprint', sprint.format());
console.log('A sprint, in hours', sprint.to(Unit.Hour));
console.log('A meeting', meeting.format([Unit.Hour, Unit.Minute]));
console.log('Both, broken down', sprint.plus(meeting).parts());
```

## A shared helper

A showcase resource: a virtual TypeScript file in this folder, which the next two showcases import as if it were on disk.

```ts showcase file=list.ts
/**
 * Renders a titled list of label and value rows into the showcase frame root
 * @param title Title of the list
 * @param rows Labels and their values
 */
export function renderList(title: string, rows: ReadonlyArray<readonly [string, string]>): void {
  const heading = document.createElement('strong');
  heading.textContent = title;
  const list = document.createElement('ul');
  for (const [label, value] of rows) {
    const item = document.createElement('li');
    item.textContent = `${label}: ${value}`;
    list.append(item);
  }
  document.getElementById('root')!.append(heading, list);
}
```

## Relative times

`relative()` picks the largest unit that fits, and lets `Intl.RelativeTimeFormat` say it in any language.

```ts showcase=ts
import { renderList } from './list.js';
import { relative } from './src/relative.js';

const now = new Date();
const minutes = (amount: number): Date => new Date(now.getTime() + amount * 60 * 1000);

renderList('In English', [
  ['5 minutes back', relative(minutes(-5), now)],
  ['3 hours on', relative(minutes(180), now)],
  ['2 days back', relative(minutes(-2 * 24 * 60), now)],
]);
renderList('In Croatian', [['3 weeks on', relative(minutes(3 * 7 * 24 * 60), now, 'hr')]]);
```

## Rounding

Floating point numbers can't hold most decimals exactly, which surprises everyone once. `round()` takes a `Rounding` mode, and gets the halves right.

```ts showcase=ts
import { renderList } from './list.js';
import { Rounding, almostEqual, round } from './src/rounding.js';

renderList('Floating point', [
  ['0.1 + 0.2', String(0.1 + 0.2)],
  ['0.1 + 0.2 === 0.3', String(0.1 + 0.2 === 0.3)],
  ['almostEqual(0.1 + 0.2, 0.3)', String(almostEqual(0.1 + 0.2, 0.3))],
]);

renderList('Rounding 1.005 to 2 decimals', [
  ['Math.round(1.005 * 100) / 100', String(Math.round(1.005 * 100) / 100)],
  ['(1.005).toFixed(2)', (1.005).toFixed(2)],
  ['round(1.005, 2)', String(round(1.005, 2))],
]);

for (const mode of Object.values(Rounding)) {
  console.log(
    `${mode}: 0.5, 1.5, 2.5 and -2.5 round to`,
    [0.5, 1.5, 2.5, -2.5].map((value) => round(value, 0, mode)),
  );
}
```

## From JavaScript

A `js` code block works too: JavaScript importing the TypeScript library, which is still type checked.

```js showcase=ts
import { Duration } from './src/duration.js';
import { Unit } from './src/units.js';

const year = Duration.of(365.2425, Unit.Day);
console.log('An average year', year.format([Unit.Day, Unit.Hour, Unit.Minute, Unit.Second]));
```
