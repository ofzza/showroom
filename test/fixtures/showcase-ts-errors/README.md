# ts showcase errors host

A syntax error in a code block:

```ts showcase=ts
const fine = 1;
const broken = ;
```

A syntax error in a [linked file](./demos/broken.ts 'showcase=ts').

An unresolved relative import:

```ts showcase=ts
console.log('first');
import { missing } from './missing';
console.log(missing);
```

An unresolved package:

```ts showcase=ts
console.log('first');

import pkg from 'not-installed-package';
console.log(pkg);
```

An unresolved import in a [real file](./demos/imports.ts 'showcase=ts').

A [warning](./demos/warning.ts 'showcase=ts'), which still builds.
