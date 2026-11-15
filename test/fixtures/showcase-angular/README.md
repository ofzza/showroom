# angular showcases host

A host component (signal inputs, an output, a root service), in a virtual template and style:

```ts showcase=angular
import { Component, signal } from '@angular/core';
import { CounterComponent } from './src/counter.component';

@Component({
  imports: [CounterComponent],
  templateUrl: './demo.html',
  styleUrl: './demo.css',
})
export default class Demo {
  readonly last = signal(0);
}
```

```html showcase file=demo.html
<host-counter label="Add" [step]="2" (changed)="last.set($event)" />
<p class="last">Last: {{ last() }}</p>
```

```css showcase file=demo.css
.last { color: teal; }
```

A [linked one](./demos/badge-demo.ts 'showcase=angular view=demo'), with a host component's real template and style, an NgModule import and a named export.

The host's own partially compiled library, by its name:

```ts showcase=angular
import { Component } from '@angular/core';
import { GreetingComponent } from 'showcase-angular-host';

@Component({
  imports: [GreetingComponent],
  template: '<host-greeting name="library" />',
})
export default class Library {}
```

With zone.js, a field changed outside Angular's signals, in a component checked eagerly (Angular 22 checks components `OnPush` by default):

```ts showcase=angular({ zone: true })
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({ template: '<p class="ticks">{{ ticks }}</p>', changeDetection: ChangeDetectionStrategy.Eager })
export default class Ticks {
  ticks = 0;

  constructor() {
    setTimeout(() => this.ticks++, 10);
  }
}
```
