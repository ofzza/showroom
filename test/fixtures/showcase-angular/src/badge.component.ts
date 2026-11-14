import { Component, input } from '@angular/core';

@Component({
  selector: 'host-badge',
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.css',
})
export class BadgeComponent {
  readonly text = input.required<string>();
}
