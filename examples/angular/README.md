# `tock`

> A made-up Angular component library, and the `angular` showcase adapter's example: this is how a host repository could document its Angular components with `showroom`. See [`README.md` › `angular` showcases](../../README.md#angular-showcases) for what an `angular` showcase can do.

`tock` counts and times, as the [`react` example](../react/README.md)'s `ticker` does, the Angular way: a stopwatch, counters stepping between bounds, and a service following the theme, all standalone components and signals. Its files are real ones, in [`src/`](./src/stopwatch.component.ts), type checked with this folder's own [`tsconfig.json`](./tsconfig.json), the nearest one to this documentation file, whose `angularCompilerOptions` check templates strictly (`strictTemplates`). It is compiled with this repository's own Angular, and runs zoneless, as Angular does by default.

## A stopwatch

A linked showcase, shown as a block beside its code: [`demo/stopwatch.ts`](./demo/stopwatch.ts) imports the library like any module would, and its default export is the standalone component the showcase frame creates. The stopwatch keeps its template and styles in files of their own, [`stopwatch.component.html`](./src/stopwatch.component.html) and [`stopwatch.component.css`](./src/stopwatch.component.css), which Angular's compiler reads.

[A stopwatch](./demo/stopwatch.ts 'showcase=angular block include=markdown')

## Counters

A code block showcase, importing the library by relative paths from this documentation file's folder. Its signal inputs set each counter's start, step and bounds, and its `changed` output logs to the console: what it logs fades in at the bottom of its showcase frame, and the counter in its corner opens the console panel.

```ts showcase=angular include=markdown
import { Component } from '@angular/core';
import { CounterComponent } from './src/counter.component.js';

@Component({
  imports: [CounterComponent],
  template: `
    <tock-counter label="Laps" />
    <tock-counter label="Minutes" [start]="30" [step]="5" [min]="0" [max]="60" (changed)="log($event)" />
  `,
})
export default class Counters {
  log(minutes: number): void {
    console.log('Minutes set to', minutes);
  }
}
```

## Following the theme

An `angular` showcase reads the showroom's theme as any page in a showcase frame does, from the `data-showroom-theme` attribute of its `<html>`: the library's [`ThemeService`](./src/theme.service.ts), provided in the root injector, follows it with a signal, and falls back to the system's theme outside the showroom. Switch the showroom's theme to see it change; the stopwatch's styles follow it with CSS's `light-dark()`.

```ts showcase=angular include=markdown
import { Component, inject } from '@angular/core';
import { ThemeService } from './src/theme.service.js';

@Component({
  template: `<p>The {{ theme() === 'dark' ? '🌙 dark' : '☀️ light' }} theme is on.</p>`,
})
export default class Theme {
  protected readonly theme = inject(ThemeService).theme;
}
```

## A shared template

A virtual file with no showcase adapter: an HTML file in this folder, which the next showcase names as its template, as if it were on disk. Angular's compiler type checks it against its component too.

```html showcase file=laps.html
<button type="button" (click)="lap()">Lap</button>
<ol>
  @for (time of laps(); track $index) {
  <li>{{ format(time) }} ({{ time / 1000 | number: '1.1-1' }} s)</li>
  }
</ol>
```

## Composing

A showcase holding state of its own, its template the virtual `laps.html`: each click records a lap, formatted by the library and by `@angular/common`'s standalone `DecimalPipe`.

```ts showcase=angular include=markdown
import { Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { formatElapsed } from './src/format.js';

@Component({
  imports: [DecimalPipe],
  templateUrl: './laps.html',
})
export default class LapTimer {
  protected readonly format = formatElapsed;
  protected readonly laps = signal<number[]>([]);
  private readonly _startedAt = Date.now();

  protected lap(): void {
    this.laps.update((laps) => [...laps, Date.now() - this._startedAt]);
  }
}
```

## With zone.js

The `zone` option (`showcase=angular({ zone: true })`) loads `zone.js` and uses zone-based change detection, for code that relies on it: here, a plain field a timer changes, which no signal announces. Zone.js notices the timer, and refreshes the component, which sets `ChangeDetectionStrategy.Eager`, as components are `OnPush` from Angular 22.

```ts showcase=angular({ zone: true }) include=markdown
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<p>{{ seconds }} seconds since this showcase started.</p>`,
})
export default class Seconds {
  seconds = 0;

  constructor() {
    setInterval(() => this.seconds++, 1000);
  }
}
```
