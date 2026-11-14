/**
 * A stopwatch, ticking in hundredths of a second
 */

import { Component } from '@angular/core';
import { StopwatchComponent } from '../src/stopwatch.component.js';

/**
 * Represents the demo: the library's stopwatch
 */
@Component({
  imports: [StopwatchComponent],
  template: `<tock-stopwatch />`,
})
export default class StopwatchDemo {}
