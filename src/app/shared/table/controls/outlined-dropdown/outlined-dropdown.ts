import { Component, input, model } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

export interface DropdownOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Outlined dropdown with a floating label. Backed by a real `mat-select` (not a
 * native `<select>`) so the open panel is a stylable CDK overlay — see the
 * `admin-form-overlay` panelClass rules in `_admin-forms.scss`. Two-way `[(value)]`.
 * Sized compact (40px) for filter bars, overriding the 48px admin-form default.
 */
@Component({
  selector: 'app-dropdown',
  imports: [MatFormFieldModule, MatSelectModule],
  host: { '[style.width.px]': 'width()' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="dd">
      <mat-label>{{ label() }}</mat-label>
      <mat-select
        [value]="value()"
        (selectionChange)="value.set($event.value)"
        panelClass="admin-form-overlay"
      >
        @for (o of options(); track o.value) {
          <mat-option [value]="o.value">{{ o.label }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      .dd {
        width: 100%;
      }
      // Compact 40px trigger for filter bars (the admin-form default is 48px).
      :host ::ng-deep .mat-mdc-form-field {
        --mat-form-field-container-height: 40px;
      }
      :host ::ng-deep .mat-mdc-form-field-infix {
        min-height: 40px !important;
        padding-top: 9px !important;
        padding-bottom: 9px !important;
      }
    `,
  ],
})
export class Dropdown {
  readonly label = input.required<string>();
  readonly value = model('');
  readonly options = input.required<readonly DropdownOption[]>();
  readonly width = input(180);
}
