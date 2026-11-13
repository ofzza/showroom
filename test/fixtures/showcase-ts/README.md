# ts showcases host

A showcase with everything it can import:

```ts showcase=ts
import { greet } from 'showcase-ts-host';
import { util } from './util';
import { shared } from './docs/shared.js';
import { index } from './docs';
import './theme.css';
import data from './data.json';
import logo from './logo.svg';

class Counter {
  value = 1;
}

const root = document.getElementById('root')!;
root.textContent = `${greet('showroom')} ${util} ${shared} ${index} ${data.answer} ${new Counter().value}`;
const image = document.createElement('img');
image.src = logo;
root.append(image);
void import('./lazy.ts').then(({ later }) => console.log(later(), import.meta.env.MODE, process.env.NODE_ENV));
```

```ts showcase file=util.ts
export const util: string = 'util';
```

```css showcase file=theme.css
#root { color: teal; }
```

A JavaScript one:

```js showcase=ts({ typeCheck: false })
console.info('plain JavaScript');
```

A [linked one](./demos/linked.ts 'showcase=ts'), importing a virtual file:

```ts showcase file=helper.ts
export const helper = (): string => 'helper';
```
