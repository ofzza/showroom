/**
 * A stopwatch: start, stop and reset, showing the elapsed time in hundredths
 */

import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { formatElapsed } from './format.js';

/**
 * Represents a stopwatch, its template and styles in files of their own
 */
@Component({
  selector: 'tock-stopwatch',
  templateUrl: './stopwatch.component.html',
  styleUrl: './stopwatch.component.css',
})
export class StopwatchComponent {
  /**
   * Milliseconds between updates of the display (10 by default)
   */
  readonly interval = input(10);

  /**
   * The elapsed time, in milliseconds
   */
  protected readonly elapsed = signal(0);

  /**
   * The elapsed time, formatted as `mm:ss.cc`
   */
  protected readonly display = computed(() => formatElapsed(this.elapsed()));

  /**
   * When the stopwatch started, as `Date.now()` minus the time elapsed before, or `undefined` while it's stopped
   */
  protected readonly startedAt = signal<number | undefined>(undefined);

  /**
   * The timer updating the display while it runs
   */
  private _timer: ReturnType<typeof setInterval> | undefined = undefined;

  /**
   * Creates the stopwatch, stopping its timer when it's destroyed
   */
  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this._timer));
  }

  /**
   * Starts the stopwatch, or stops it
   */
  protected toggle(): void {
    clearInterval(this._timer);
    if (this.startedAt() !== undefined) {
      this.startedAt.set(undefined);
      return;
    }
    const startedAt = Date.now() - this.elapsed();
    this.startedAt.set(startedAt);
    this._timer = setInterval(() => this.elapsed.set(Date.now() - startedAt), this.interval());
  }

  /**
   * Resets the elapsed time, and keeps running if it was
   */
  protected reset(): void {
    const running = this.startedAt() !== undefined;
    if (running) this.toggle();
    this.elapsed.set(0);
    if (running) this.toggle();
  }
}
