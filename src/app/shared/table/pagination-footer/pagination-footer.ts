import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Pagination footer — a restyle of the previous mat-paginator behavior.
 * `page` is 1-based. Emits `pageChange` / `perPageChange`; the screen owns state
 * (no persistence). Numbered pager shows up to 5 pages + `…` (no smart window).
 */
@Component({
  selector: 'app-pagination-footer',
  imports: [MatIconModule],
  template: `
    <div class="pf">
      <div class="pf__left">
        <span class="pf__perlabel">Por página</span>
        <div class="pf__selectwrap">
          <select
            class="pf__select"
            [value]="perPage()"
            (change)="onPerPage($event)"
            aria-label="Resultados por página"
          >
            @for (n of perPageOptions(); track n) {
              <option [value]="n">{{ n }}</option>
            }
          </select>
          <mat-icon class="pf__selectchev">expand_more</mat-icon>
        </div>
      </div>

      <div class="pf__right">
        <span class="pf__range">
          <strong>{{ start() }}–{{ end() }}</strong> de {{ total().toLocaleString('es-CR') }}
        </span>
        <div class="pf__pager">
          <button
            type="button"
            class="pf__pg"
            [disabled]="page() <= 1"
            (click)="go(page() - 1)"
            aria-label="Página anterior"
          >
            <mat-icon>chevron_left</mat-icon>
          </button>
          @for (p of pageButtons(); track p) {
            <button
              type="button"
              class="pf__pg pf__pg--num"
              [class.pf__pg--active]="p === page()"
              [attr.aria-label]="'Página ' + p"
              [attr.aria-current]="p === page() ? 'page' : null"
              (click)="go(p)"
            >
              {{ p }}
            </button>
          }
          @if (pages() > 5) {
            <span class="pf__ellipsis">…</span>
          }
          <button
            type="button"
            class="pf__pg"
            [disabled]="page() >= pages()"
            (click)="go(page() + 1)"
            aria-label="Página siguiente"
          >
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .pf {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 18px;
        border-top: 1px solid var(--border-subtle);
        background: var(--surface-card);
      }
      .pf__left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pf__perlabel {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .pf__selectwrap {
        position: relative;
        display: inline-flex;
      }
      .pf__select {
        appearance: none;
        -webkit-appearance: none;
        height: 30px;
        padding: 0 28px 0 10px;
        border: 1px solid var(--border-subtle);
        border-radius: 6px;
        background: var(--surface-card);
        color: var(--text-primary);
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.4px;
        cursor: pointer;
        outline: none;
      }
      .pf__selectchev {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--text-tertiary);
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .pf__right {
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .pf__range {
        font-family: var(--font-mono);
        font-size: 10.5px;
        letter-spacing: 0.4px;
        color: var(--text-secondary);
      }
      .pf__range strong {
        color: var(--text-primary);
        font-weight: 700;
      }
      .pf__pager {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .pf__pg {
        width: 30px;
        height: 30px;
        padding: 0;
        border: 1px solid var(--border-subtle);
        border-radius: 6px;
        background: var(--surface-card);
        color: var(--text-secondary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-size: 11px;
        font-weight: 700;
      }
      .pf__pg:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .pf__pg--active {
        background: var(--text-primary);
        color: #fff;
        border-color: var(--text-primary);
      }
      .pf__pg mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .pf__ellipsis {
        align-self: center;
        color: var(--text-tertiary);
        font-family: var(--font-mono);
        font-size: 11px;
      }
    `,
  ],
})
export class PaginationFooter {
  readonly page = input.required<number>();
  readonly perPage = input.required<number>();
  readonly total = input.required<number>();
  readonly perPageOptions = input<readonly number[]>([10, 25, 50, 100]);
  readonly pageChange = output<number>();
  readonly perPageChange = output<number>();

  protected readonly pages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.perPage())),
  );
  protected readonly start = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.perPage() + 1,
  );
  protected readonly end = computed(() => Math.min(this.page() * this.perPage(), this.total()));
  protected readonly pageButtons = computed(() =>
    Array.from({ length: Math.min(this.pages(), 5) }, (_, i) => i + 1),
  );

  protected go(p: number): void {
    const clamped = Math.min(Math.max(1, p), this.pages());
    if (clamped !== this.page()) this.pageChange.emit(clamped);
  }

  protected onPerPage(event: Event): void {
    this.perPageChange.emit(+(event.target as HTMLSelectElement).value);
  }
}
