# `tempo`

> A made-up TypeScript library, and the `ts` showcase adapter's example: this is how a host repository could document its TypeScript with `showroom`. See [`README.md` › `ts` showcases](../../README.md#ts-showcases) for what a `ts` showcase can do.
>
> This example is part of this repository's own showroom: see its showcases running in [the published showroom](https://ofzza.github.io/showroom/#/examples/ts/README.md), or preview it from a clone of this repository with `npm ci`, then `npm start -- serve`, at its root. Read anywhere else (e.g. on GitHub), each showcase is only its code block or its link.

`tempo` measures time and rounds numbers, typed throughout: units are an `enum`, durations a class, and roundings an `enum` again. Its files are real ones, in `src/` (e.g. [`units.ts`](./src/units.ts)), type checked with this folder's own [`tsconfig.json`](./tsconfig.json), the nearest one to this documentation file.

## A countdown

A linked showcase, shown as a block: [`demo/countdown.ts`](./demo/countdown.ts) imports the library like any module would, and writes into the showcase frame root, `#root`. A `ts` showcase shows its code and its console by default; this one asks for its `demo` view instead (`view=demo`), its showcase frame, with its code a click away. What it logs shows briefly in its header bar, and the `>_ runtime` status mark, or the line itself, opens the console panel.

[A countdown to the new year](./demo/countdown.ts 'showcase=ts block view=demo include=markdown')

## The countdown, inline

A linked showcase is shown inline by default: it stays a link in its text, which opens it in the showcase sidebar. Here is one as written, then in use (in the showroom, a link with a "play" icon; anywhere else, a plain link to the file):

```md
[the countdown, in the showcase sidebar](./demo/countdown.ts 'showcase=ts')
```

Open [the countdown, in the showcase sidebar](./demo/countdown.ts 'showcase=ts'). Its marker names no showcase views, and a linked showcase shown inline takes none by default (neither `showroom.json`'s `showcaseViews` nor the `ts` showcase adapter's default views apply to it), so the showcase sidebar shows its code pane alone, and its page is never loaded; it is still built and type checked like any other showcase.

## Durations

A code block showcase, importing the library by relative paths from this documentation file's folder, shown by the `ts` showcase adapter's default views: its code, then its console, where everything it logs shows.

```ts showcase=ts include=markdown
import { Duration } from './src/duration.js';
import { Unit } from './src/units.js';

const sprint: Duration = Duration.of(2, Unit.Week);
const meeting: Duration = Duration.of(90, Unit.Minute);

console.log('A sprint', sprint.format());
console.log('A sprint, in hours', sprint.to(Unit.Hour));
console.log('A meeting', meeting.format([Unit.Hour, Unit.Minute]));
console.log('Both, broken down', sprint.plus(meeting).parts());
```

## Units

A showcase reading the library's units, with the file it reads them from among its tabs. Its marker includes [`units.ts`](./src/units.ts), a real file, and places its own code's tab after it: `include=markdown,./src/units.ts,source`. Its code pane's tabs are then its Markdown, `src/units.ts`, and its own code, in that order; without `source` in the list, its own code's tab would come before `src/units.ts`. Including the file only adds the tab: the showcase imports it either way.

```ts showcase=ts include=markdown,./src/units.ts,source
import { MILLISECONDS, UNITS } from './src/units.js';

for (const unit of UNITS) {
  console.log(`1 ${unit} is`, MILLISECONDS[unit], 'ms');
}
```

## A shared helper

A named showcase: its virtual TypeScript file is `list.ts`, in this folder, which the next two showcases import as if it were on disk. It is built and type checked as a showcase of its own, shown by its code alone (`view=source`): it only declares a function, so its page would show and log nothing.

```ts showcase=ts file=list.ts view=source include=markdown
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

`relative()` picks the largest unit that fits, and lets `Intl.RelativeTimeFormat` say it in any language. This showcase renders its list into the page, so it is shown by its `demo` view (`view=demo`).

```ts showcase=ts view=demo include=markdown
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

Floating point numbers can't hold most decimals exactly, which surprises everyone once. `round()` takes a `Rounding` mode, and gets the halves right. Its code, then its rendered list (`view=source,demo`).

```ts showcase=ts view=source,demo include=markdown
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

```js showcase=ts include=markdown
import { Duration } from './src/duration.js';
import { Unit } from './src/units.js';

const year = Duration.of(365.2425, Unit.Day);
console.log('An average year', year.format([Unit.Day, Unit.Hour, Unit.Minute, Unit.Second]));
```
