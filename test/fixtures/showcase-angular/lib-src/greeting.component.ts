import { Component, input } from '@angular/core';

@Component({
  selector: 'host-greeting',
  template: `<p class="greeting">Hello, {{ name() }}!</p>`,
})
export class GreetingComponent {
  readonly name = input('world');
}
