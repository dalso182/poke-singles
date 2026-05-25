import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Btn } from '../../table/controls/btn/btn';

/** Sticky right-aligned action footer for create/edit pages. */
@Component({
  selector: 'app-form-footer',
  imports: [MatIconModule, Btn],
  template: `
    <div class="ff" [class.ff--sticky]="sticky()">
      @if (info()) {
        <div class="ff__info">
          <mat-icon>info</mat-icon>
          <span>{{ info() }}</span>
        </div>
      }
      <div class="ff__actions">
        <app-btn variant="ghost" (click)="secondary.emit()">{{ secondaryLabel() }}</app-btn>
        <app-btn variant="primary" [disabled]="primaryDisabled()" (click)="primary.emit()">
          {{ primaryLabel() }}
        </app-btn>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 28px;
      }
      .ff {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 28px;
        background: var(--surface-card);
        border: 1px solid var(--border-subtle);
        border-radius: 14px;
      }
      .ff--sticky {
        position: sticky;
        bottom: 0;
        box-shadow: 0 -10px 24px -16px rgba(21, 21, 26, 0.12);
      }
      .ff__info {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-brand);
        font-size: 12px;
        font-weight: 500;
        color: var(--text-secondary);
      }
      .ff__info mat-icon {
        color: var(--text-tertiary);
        font-size: 14px;
        width: 14px;
        height: 14px;
        line-height: 14px;
      }
      .ff__actions {
        margin-left: auto;
        display: flex;
        gap: 10px;
      }
    `,
  ],
})
export class FormFooter {
  readonly primaryLabel = input('Guardar');
  readonly secondaryLabel = input('Cancelar');
  readonly primaryDisabled = input(false);
  readonly sticky = input(true);
  readonly info = input<string | null>(null);
  readonly primary = output<void>();
  readonly secondary = output<void>();
}
