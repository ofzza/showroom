import { Component, inject, input, output, signal } from '@angular/core';
import { CounterService } from './counter.service';

@Component({
  selector: 'host-counter',
  template: `
    <button type="button" (click)="click()">{{ label() }} +{{ step() }}</button>
    @if (count() > 0) {
      <span class="count">{{ count() }} (total {{ service.total() }})</span>
    }
  `,
  styles: `.count { color: rebeccapurple; }`,
})
export class CounterComponent {
  readonly label = input.required<string>();
  readonly step = input(1);
  readonly changed = output<number>();
  protected readonly service = inject(CounterService);
  protected readonly count = signal(0);

  click() {
    this.count.update((c) => c + this.step());
    this.service.add(this.step());
    this.changed.emit(this.count());
  }
}
