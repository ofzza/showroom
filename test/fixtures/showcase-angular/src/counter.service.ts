import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CounterService {
  readonly total = signal(0);

  add(n: number) {
    this.total.update((t) => t + n);
  }
}
