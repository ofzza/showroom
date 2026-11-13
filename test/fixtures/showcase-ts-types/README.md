# ts showcases with type errors

A type error in a code block:

```ts showcase=ts
const inline: number = 'one';
console.log(inline);
```

A [linked one](./demos/linked.ts 'showcase=ts'), and one with a type error in a virtual resource:

```ts showcase=ts
import { helper } from './helper';
console.log(helper);
```

```ts showcase file=helper.ts
export const helper: boolean = 'yes';
```

Two showcases reaching the same host file:

```ts showcase=ts
import { broken } from './src/broken';
console.log(broken);
```

```ts showcase=ts
import { broken } from './src/broken';
console.log(broken + 1);
```

Type checking turned off:

```ts showcase=ts({ typeCheck: false })
const unchecked: number = 'unchecked';
console.log(unchecked);
```

A JavaScript entry point, importing a typed file:

```js showcase=ts
import { twice } from './src/typed';
console.log(twice(2));
```

A JavaScript import without declarations, then with allowJs:

```ts showcase=ts
import { legacy } from './src/legacy.js';
console.log(legacy);
```

```ts showcase=ts({ allowJs: true })
import { legacy } from './src/legacy.js';
console.log(legacy);
```

An asset, and the environment, as the host's own declarations have them:

```ts showcase=ts
import logo from './logo.svg';
console.log(logo, import.meta.env.MODE);
```

A bundle warning, kept when type checking fails:

```ts showcase=ts
eval('1');
const warned: string = 1;
console.log(warned);
```
