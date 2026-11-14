import { Component } from '@angular/core';

// No showcase reaches this component, so its errors are left to the host's own checks
@Component({
  selector: 'host-unreached',
  template: `<p>{{ missing }}</p>`,
})
export class UnreachedComponent {
  readonly count: number = 'not a number';
}
