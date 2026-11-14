/**
 * A counter: a number stepped up and down between bounds
 */

import { Component, input, linkedSignal, output } from '@angular/core';

/**
 * Represents a counter, its template and styles inline
 */
@Component({
  selector: 'tock-counter',
  template: `
    <span>{{ label() }}</span>
    <button type="button" (click)="change(-step())" [disabled]="value() <= min()">−{{ step() }}</button>
    <strong>{{ value() }}</strong>
    <button type="button" (click)="change(step())" [disabled]="value() >= max()">+{{ step() }}</button>
  `,
  styles: `
    :host {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin: 0.5rem 0;
    }
    strong {
      font: 2rem monospace;
      font-variant-numeric: tabular-nums;
      color: light-dark(#c3002f, #ff6b81);
    }
    button {
      min-width: 2.5rem;
    }
  `,
})
export class CounterComponent {
  /**
   * The label shown before the number
   */
  readonly label = input.required<string>();

  /**
   * The number it starts at (0 by default)
   */
  readonly start = input(0);

  /**
   * How much each click adds or takes away (1 by default)
   */
  readonly step = input(1);

  /**
   * The lowest number it goes down to
   */
  readonly min = input(-Infinity);

  /**
   * The highest number it goes up to
   */
  readonly max = input(Infinity);

  /**
   * Emits the new number after every change
   */
  readonly changed = output<number>();

  /**
   * The current number, starting again from `start` when it changes
   */
  protected readonly value = linkedSignal(() => this.start());

  /**
   * Steps the number, within its bounds
   * @param by How much to add (negative to take away)
   */
  protected change(by: number): void {
    const next = Math.min(this.max(), Math.max(this.min(), this.value() + by));
    this.value.set(next);
    this.changed.emit(next);
  }
}
