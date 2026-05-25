import { Component, computed, input, model } from '@angular/core';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';

/**
 * Filter-bar date-range picker. Two-way `[(start)]` / `[(end)]`, each an ISO
 * `YYYY-MM-DD` string (or null when empty), fed straight to a date-ranged RPC.
 * One Material range calendar — pick start + end in a single popup — styled flat
 * to match `app-search-input` and sized compact (38px) for the filter bar.
 */
@Component({
  selector: 'app-date-range',
  imports: [MatDatepickerModule, MatFormFieldModule, MatIconModule],
  providers: [provideNativeDateAdapter()],
  host: { '[style.width.px]': 'width()' },
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="dr">
      <mat-date-range-input [rangePicker]="picker" separator="–">
        <input
          matStartDate
          [value]="startDate()"
          (dateChange)="start.set(toIso($event.value))"
          placeholder="Inicio"
        />
        <input
          matEndDate
          [value]="endDate()"
          (dateChange)="end.set(toIso($event.value))"
          placeholder="Fin"
        />
      </mat-date-range-input>
      @if (start() || end()) {
        <button
          type="button"
          matIconSuffix
          class="dr__clear"
          aria-label="Limpiar fechas"
          (click)="clear()"
        >
          <mat-icon>close</mat-icon>
        </button>
      }
      <mat-datepicker-toggle matIconSuffix [for]="picker" />
      <mat-date-range-picker #picker />
    </mat-form-field>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex: none;
      }
      .dr {
        width: 100%;
      }
      :host ::ng-deep .mat-mdc-form-field {
        --mat-form-field-container-height: 38px;
        width: 100%;
      }
      // Flatten the Material outline into a flat box matching app-search-input.
      :host ::ng-deep .mat-mdc-text-field-wrapper {
        box-sizing: border-box;
        background: var(--surface-page);
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        padding: 0 6px 0 12px;
      }
      :host ::ng-deep .mdc-notched-outline__leading,
      :host ::ng-deep .mdc-notched-outline__notch,
      :host ::ng-deep .mdc-notched-outline__trailing {
        border: none !important;
      }
      // Center the contents in the compact 38px height.
      :host ::ng-deep .mat-mdc-form-field-flex {
        align-items: center;
      }
      :host ::ng-deep .mat-mdc-form-field-infix {
        padding: 0 !important;
        min-height: 36px !important;
        min-width: 0;
        width: auto;
        display: flex;
        align-items: center;
      }
      // The range input row fills the infix height and centers its text.
      :host ::ng-deep .mat-date-range-input {
        display: flex;
        align-items: center;
      }
      :host ::ng-deep .mat-date-range-input input {
        padding: 0;
        line-height: normal;
      }
      :host ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }
      // Match app-search-input typography.
      :host ::ng-deep .mat-date-range-input,
      :host ::ng-deep .mat-mdc-form-field input {
        font-family: var(--font-brand);
        font-size: 12.5px;
        color: var(--text-primary);
      }
      :host ::ng-deep .mat-date-range-input-separator {
        color: var(--text-tertiary);
      }
      // Suffix icons: center and shrink the toggle so it fits the 38px box.
      :host ::ng-deep .mat-mdc-form-field-icon-suffix {
        align-self: center;
        display: inline-flex;
        align-items: center;
      }
      :host ::ng-deep .mat-mdc-form-field-icon-suffix .mat-mdc-icon-button {
        width: 30px;
        height: 30px;
        padding: 3px;
        --mdc-icon-button-state-layer-size: 30px;
      }
      :host ::ng-deep .mat-mdc-form-field-icon-suffix .mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        line-height: 18px;
        color: var(--text-tertiary);
      }
      .dr__clear {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--text-tertiary);
        padding: 0;
      }
      .dr__clear mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        line-height: 18px;
      }
    `,
  ],
})
export class DateRange {
  readonly width = input(260);
  /** Inclusive bounds as ISO `YYYY-MM-DD` strings (null = open-ended). */
  readonly start = model<string | null>(null);
  readonly end = model<string | null>(null);

  // ISO string -> Date for the matStartDate/matEndDate inputs. Parse at local
  // midnight so the calendar shows the intended day, not UTC-1.
  protected readonly startDate = computed(() => this.fromIso(this.start()));
  protected readonly endDate = computed(() => this.fromIso(this.end()));

  protected toIso(d: Date | null): string | null {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  protected clear(): void {
    this.start.set(null);
    this.end.set(null);
  }

  private fromIso(iso: string | null): Date | null {
    return iso ? new Date(`${iso}T00:00:00`) : null;
  }
}
