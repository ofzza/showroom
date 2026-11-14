# angular showcase errors host

No default export:

```ts showcase=angular
import { Component } from '@angular/core';

@Component({ template: '<p>named</p>' })
export class Named {}
```

A default export that isn't a standalone component:

```ts showcase=angular
import { Component } from '@angular/core';

@Component({ standalone: false, template: '<p>declared</p>' })
export default class Declared {}
```

A default export that isn't a component at all:

```ts showcase=angular
export default class Plain {}
```

A type error in TypeScript:

```ts showcase=angular
import { Component } from '@angular/core';

@Component({ template: '<p>{{ count }}</p>' })
export default class Typed {
  readonly count: number = 'one';
}
```

A type error in an inline template:

```ts showcase=angular
import { Component } from '@angular/core';

@Component({
  template: `
    <p>{{ title }}</p>
    <p>{{ missing }}</p>
  `,
})
export default class Inline {
  readonly title = 'inline';
}
```

A type error in a host component's template file:

```ts showcase=angular
import { Component } from '@angular/core';
import { BrokenComponent } from './src/broken.component';

@Component({ imports: [BrokenComponent], template: '<host-broken />' })
export default class UsesBroken {}
```

An extended diagnostic, a warning (an optional chain on a value that is never null):

```ts showcase=angular
import { Component } from '@angular/core';

@Component({ template: '<p>{{ user?.name }}</p>' })
export default class Warned {
  readonly user = { name: 'warned' };
}
```

Without type checking, a missing named export is left to the bundle:

```ts showcase=angular({ typeCheck: false })
import { Component } from '@angular/core';
import { missing } from './src/parts';

@Component({ template: '<p>{{ value }}</p>' })
export default class Unchecked {
  readonly value = missing;
}
```
