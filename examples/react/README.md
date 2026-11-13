# `ticker`

> A made-up React component library, and the `react` showcase adapter's example: this is how a host repository could document its React components with `showroom`. See [`README.md` › `react` showcases](../../README.md#react-showcases) for what a `react` showcase can do.

`ticker` counts and times: a stopwatch, counters stepping between bounds, and a hook following the theme. Its files are real ones, in [`src/`](./src/Stopwatch.tsx), type checked with this folder's own [`tsconfig.json`](./tsconfig.json), the nearest one to this documentation file. It is rendered with this repository's own React.

## A stopwatch

A linked showcase: [`demo/Stopwatch.tsx`](./demo/Stopwatch.tsx) imports the library like any module would, and its default export is the component the showcase frame renders.

[A stopwatch](./demo/Stopwatch.tsx 'showcase=react')

## Counters

An inline showcase, importing the library by relative paths from this documentation file's folder. Its props set each counter's start, step and bounds; what it logs shows in the console panel below it.

```tsx showcase=react
import { Counter } from './src/Counter.js';

export default function Counters() {
  return (
    <>
      <Counter label="Laps" />
      <Counter label="Minutes" start={30} step={5} min={0} max={60} onChange={(minutes) => console.log('Minutes set to', minutes)} />
    </>
  );
}
```

## Following the theme

A `react` showcase reads the showroom's theme as any page in a showcase frame does, from the `data-showroom-theme` attribute of its `<html>`: the library's [`useShowroomTheme()`](./src/useShowroomTheme.ts) hook follows it, and falls back to the system's theme outside the showroom. Switch the showroom's theme to see it change; the stopwatch's styles follow it with CSS's `light-dark()`.

```tsx showcase=react
import { useShowroomTheme } from './src/useShowroomTheme.js';

export default function Theme() {
  const theme = useShowroomTheme();
  return <p>The {theme === 'dark' ? '🌙 dark' : '☀️ light'} theme is on.</p>;
}
```

## A shared component

A showcase resource: a virtual TSX file in this folder, which the next showcase imports as if it were on disk.

```tsx showcase file=Laps.tsx
import { formatElapsed } from './src/format.js';

/**
 * Lists lap times, each formatted as minutes, seconds and hundredths
 * @param props The lap times, in milliseconds
 * @returns The list
 */
export function Laps({ times }: { times: readonly number[] }) {
  return (
    <ol>
      {times.map((time, index) => (
        <li key={index}>{formatElapsed(time)}</li>
      ))}
    </ol>
  );
}
```

## Composing

A showcase holding state of its own, around the library's components and the virtual one: each click records a lap.

```tsx showcase=react
import { useState } from 'react';
import { Laps } from './Laps.js';

export default function LapTimer() {
  const [startedAt] = useState(() => Date.now());
  const [laps, setLaps] = useState<number[]>([]);
  return (
    <>
      <button onClick={() => setLaps([...laps, Date.now() - startedAt])}>Lap</button>
      <Laps times={laps} />
    </>
  );
}
```

## Memoized components

The default export can be any component React renders, e.g. one wrapped in `memo()`, which is an object rather than a function.

```tsx showcase=react
import { memo } from 'react';
import { formatElapsed } from './src/format.js';

export default memo(function Marathon() {
  return <p>A 2-hour marathon is {formatElapsed(2 * 60 * 60 * 1000)} on the stopwatch.</p>;
});
```

## From JSX

A `jsx` code block works too: JavaScript importing the TypeScript library, which is still type checked.

```jsx showcase=react
import { Stopwatch } from './src/Stopwatch.js';

export default function SlowStopwatch() {
  return <Stopwatch interval={1000} />;
}
```
