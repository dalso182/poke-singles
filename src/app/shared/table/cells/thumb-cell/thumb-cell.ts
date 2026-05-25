import { Component, input } from '@angular/core';

/** Small product thumbnail with an optional language tag overlay. */
@Component({
  selector: 'app-thumb',
  template: `
    <div class="thumb" [style.width.px]="size()" [style.height.px]="size() * 1.32">
      @if (src()) {
        <img class="thumb__img" [src]="src()" alt="" loading="lazy" />
      }
      @if (lang()) {
        <span class="thumb__lang">{{ lang() }}</span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .thumb {
        position: relative;
        flex-shrink: 0;
        border: 1px solid var(--border-subtle);
        border-radius: 4px;
        overflow: hidden;
        background: var(--surface-tonal);
      }
      .thumb__img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .thumb__lang {
        position: absolute;
        right: 3px;
        bottom: 3px;
        font-family: var(--font-mono);
        font-size: 7px;
        font-weight: 700;
        letter-spacing: 0.6px;
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.92);
        padding: 1px 3px;
        border-radius: 2px;
      }
    `,
  ],
})
export class Thumb {
  readonly src = input<string | null>(null);
  readonly lang = input<string | null>(null);
  readonly size = input(42);
}
