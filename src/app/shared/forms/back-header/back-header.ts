import { Component, inject, input } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** Create/edit page header: back arrow + amber kicker + title + sub + actions slot. */
@Component({
  selector: 'app-back-header',
  imports: [MatIconModule],
  template: `
    <div class="bh">
      <button type="button" class="bh__back" aria-label="Volver" (click)="onBack()">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <div class="bh__text">
        @if (kicker()) {
          <div class="bh__kicker">{{ kicker() }}</div>
        }
        <h1 class="bh__title">{{ title() }}</h1>
        @if (sub()) {
          <div class="bh__sub">{{ sub() }}</div>
        }
      </div>
      <div class="bh__actions"><ng-content /></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .bh {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
      }
      .bh__back {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 1px solid var(--border-subtle);
        background: var(--surface-card);
        color: var(--text-secondary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s ease;
      }
      .bh__back:hover {
        background: var(--surface-tonal);
      }
      .bh__back mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        line-height: 20px;
      }
      .bh__text {
        flex: 1;
        min-width: 0;
      }
      .bh__kicker {
        font-family: var(--font-mono);
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 1.8px;
        text-transform: uppercase;
        color: var(--accent-amber);
        line-height: 1.4;
      }
      .bh__title {
        margin: 6px 0;
        font-family: var(--font-brand);
        font-size: 32px;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -1px;
        color: var(--text-primary);
      }
      .bh__sub {
        font-family: var(--font-brand);
        font-size: 13.5px;
        font-weight: 500;
        line-height: 1.4;
        color: var(--text-secondary);
      }
      .bh__actions {
        display: flex;
        gap: 8px;
      }
    `,
  ],
})
export class BackHeader {
  readonly kicker = input<string | null>(null);
  readonly title = input.required<string>();
  readonly sub = input<string | null>(null);
  /** Optional explicit destination; falls back to Location.back(). */
  readonly backLink = input<string | null>(null);

  private readonly location = inject(Location);
  private readonly router = inject(Router);

  protected onBack(): void {
    const link = this.backLink();
    if (link) {
      void this.router.navigateByUrl(link);
    } else {
      this.location.back();
    }
  }
}
