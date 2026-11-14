# Angular 20 host

A showcase compiled and rendered with the host's own Angular 20, zoneless:

```ts showcase=angular
import { Component, signal, VERSION } from '@angular/core';

@Component({ template: '<p class="version">Angular {{ version() }}</p>' })
export default class Version {
  readonly version = signal(VERSION.full);
}
```

With the host's own zone.js:

```ts showcase=angular({ zone: true })
import { Component } from '@angular/core';

@Component({ template: '<p class="zone">{{ zone }}</p>' })
export default class Zoned {
  readonly zone = typeof (globalThis as { Zone?: unknown }).Zone;
}
```
