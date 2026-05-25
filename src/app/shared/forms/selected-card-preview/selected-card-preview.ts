import { Component, input, output } from '@angular/core';

/**
 * Lavender preview band shown on add-product/product-edit when a card is
 * autopopulated from TCGdex. Chrome (band + image + kicker + name + set line) is
 * fixed; the detail lines, image-missing notice, and "Cambiar carta" link are
 * projected so each screen keeps its exact content. Image load/error are emitted
 * so the host can track a missing hosted image.
 */
@Component({
  selector: 'app-selected-card-preview',
  template: `
    <div class="scp">
      @if (imageUrl()) {
        <img
          class="scp__img"
          [src]="imageUrl()"
          [alt]="name()"
          (load)="imgLoad.emit()"
          (error)="imgError.emit()"
        />
      } @else {
        <div class="scp__img scp__img--empty"></div>
      }
      <div class="scp__body">
        <div class="scp__kicker">Seleccionada</div>
        <h2 class="scp__name">{{ name() }}</h2>
        @if (setLine()) {
          <div class="scp__meta">{{ setLine() }}</div>
        }
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-bottom: 22px;
      }
      .scp {
        display: flex;
        gap: 22px;
        align-items: flex-start;
        padding: 18px;
        background: #efeaf7;
        border: 1px solid #dad1ef;
        border-radius: 14px;
      }
      .scp__img {
        flex-shrink: 0;
        width: 120px;
        height: 168px;
        object-fit: contain;
        border-radius: 8px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        background: var(--surface-card);
        display: block;
      }
      .scp__img--empty {
        background: var(--surface-tonal);
      }
      .scp__body {
        flex: 1;
        min-width: 0;
      }
      .scp__kicker {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        color: var(--accent-amber);
      }
      .scp__name {
        margin: 4px 0 10px;
        font-family: var(--font-brand);
        font-size: 26px;
        font-weight: 800;
        letter-spacing: -0.8px;
        color: var(--text-primary);
      }
      .scp__meta {
        font-family: var(--font-mono);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: var(--text-secondary);
      }
    `,
  ],
})
export class SelectedCardPreview {
  readonly imageUrl = input<string | null>(null);
  readonly name = input.required<string>();
  readonly setLine = input<string | null>(null);
  readonly imgLoad = output<void>();
  readonly imgError = output<void>();
}
