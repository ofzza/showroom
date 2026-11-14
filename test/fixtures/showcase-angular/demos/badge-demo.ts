import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { BadgeComponent } from '../src/badge.component';

@Component({
  imports: [CommonModule, BadgeComponent],
  template: `<host-badge [text]="'linked' | uppercase" />`,
})
export default class BadgeDemo {}

export const ignored = 'named exports are ignored';
