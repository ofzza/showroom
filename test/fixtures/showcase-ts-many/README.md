# Ten ts showcases host

Each showcase builds on its own, with Vite, one after another.

```ts showcase file=counter.ts
export const counter = (start: number): (() => number) => {
  let value = start;
  return () => ++value;
};
```

```css showcase file=counter.css
#root { font-family: sans-serif; }
```

Showcase 1:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(10);
document.getElementById('root')!.textContent = `Showcase 1: ${next()}`;
console.log('showcase 1', next());
```

Showcase 2:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(20);
document.getElementById('root')!.textContent = `Showcase 2: ${next()}`;
console.log('showcase 2', next());
```

Showcase 3:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(30);
document.getElementById('root')!.textContent = `Showcase 3: ${next()}`;
console.log('showcase 3', next());
```

Showcase 4:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(40);
document.getElementById('root')!.textContent = `Showcase 4: ${next()}`;
console.log('showcase 4', next());
```

Showcase 5:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(50);
document.getElementById('root')!.textContent = `Showcase 5: ${next()}`;
console.log('showcase 5', next());
```

Showcase 6:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(60);
document.getElementById('root')!.textContent = `Showcase 6: ${next()}`;
console.log('showcase 6', next());
```

Showcase 7:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(70);
document.getElementById('root')!.textContent = `Showcase 7: ${next()}`;
console.log('showcase 7', next());
```

Showcase 8:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(80);
document.getElementById('root')!.textContent = `Showcase 8: ${next()}`;
console.log('showcase 8', next());
```

Showcase 9:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(90);
document.getElementById('root')!.textContent = `Showcase 9: ${next()}`;
console.log('showcase 9', next());
```

Showcase 10:

```ts showcase=ts
import { counter } from './counter';
import './counter.css';

const next = counter(100);
document.getElementById('root')!.textContent = `Showcase 10: ${next()}`;
console.log('showcase 10', next());
```
