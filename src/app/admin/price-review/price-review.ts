import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ReportsService } from '../../core/reports/reports.service';
import { AppSettingsService } from '../../core/settings/app-settings.service';
import type {
  PriceReviewCard,
  PriceReviewProgress,
  PriceReviewSummary,
} from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { Btn } from '../../shared/table/controls/btn/btn';
import { Thumb } from '../../shared/table/cells/thumb-cell/thumb-cell';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Money } from '../../shared/table/cells/money-cell/money-cell';

type RunPhase = 'idle' | 'configuring' | 'running';

/**
 * Top-level admin feature: "Revisión de precios". Card-by-card triage of
 * products whose store price has drifted from the TCGplayer market signal.
 * Same `price_reviews` rows are populated by both this manual run and the
 * weekly Edge Function (cron); both write through `admin_record_price_check`.
 *
 * Flow: idle → click "Ejecutar revisión" → configuring (options panel with
 * threshold % + floor ₡ pre-filled from app_settings, qualifying count refresh
 * on floor change) → "Iniciar" → running (progress chip in header) → idle.
 * Whatever values are entered in the options panel are used for that one run
 * only — `app_settings` is not touched.
 */
@Component({
  selector: 'app-admin-price-review',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
    PageHeader,
    Btn,
    Thumb,
    Pill,
    Money,
  ],
  templateUrl: './price-review.html',
  styleUrl: './price-review.scss',
  // Zoneless app: async patchValue() doesn't notify CD, so floating labels keep
  // prefilled values readable.
  providers: [
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { floatLabel: 'always' } },
  ],
})
export class PriceReview {
  private readonly reports = inject(ReportsService);
  private readonly settings = inject(AppSettingsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly summary = signal<PriceReviewSummary | null>(null);
  protected readonly current = signal<PriceReviewCard | null>(null);
  protected readonly loading = signal(false);
  protected readonly acting = signal(false); // accept/ignore in flight

  protected readonly phase = signal<RunPhase>('idle');
  protected readonly progress = signal<PriceReviewProgress | null>(null);

  /**
   * Initial size of the current triage batch (queue size when we first
   * landed on the screen or just after a fresh run completed). Anchors the
   * "X de Y" position so the denominator doesn't shrink while the admin
   * works through the cards.
   */
  protected readonly batchTotal = signal<number | null>(null);

  // ─── Options-panel form ─────────────────────────────────────────────────
  // Free-standing FormControls (not a FormGroup) — we don't ship these to the
  // server as a group, and signal-bound number inputs need straightforward
  // updates for the live qualifying-count effect.
  protected readonly thresholdCtrl = new FormControl<number | null>(null, {
    nonNullable: false,
    validators: [Validators.required, Validators.min(0.01), Validators.max(100)],
  });
  protected readonly floorCtrl = new FormControl<number | null>(null, {
    nonNullable: false,
    validators: [Validators.required, Validators.min(0)],
  });
  /** Live mirror of floorCtrl as a signal so an effect can debounce off it. */
  protected readonly floorValue = signal<number>(0);
  protected readonly qualifyingCount = signal<number | null>(null);

  // ─── Current-card editable price ────────────────────────────────────────
  protected readonly priceCtrl = new FormControl<number | null>(null, {
    nonNullable: false,
    validators: [Validators.required, Validators.min(1)],
  });

  protected readonly diffLabel = computed(() => {
    const c = this.current();
    if (!c) return '';
    const sign = c.diff_pct > 0 ? '+' : c.diff_pct < 0 ? '−' : '';
    return `${sign}${Math.abs(c.diff_pct).toFixed(1)}%`;
  });

  protected readonly direction = computed<'over' | 'under' | 'flat'>(() => {
    const c = this.current();
    if (!c) return 'flat';
    return c.diff_pct > 0 ? 'over' : c.diff_pct < 0 ? 'under' : 'flat';
  });

  protected readonly directionLabel = computed(() => {
    switch (this.direction()) {
      case 'over': return 'sobre el mercado';
      case 'under': return 'bajo el mercado';
      default: return '';
    }
  });

  /** Signed CRC delta between store and condition-adjusted market — e.g. "+₡20 905". */
  protected readonly diffCrcLabel = computed(() => {
    const c = this.current();
    if (!c) return '';
    const delta = c.store_price - c.market_crc;
    const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
    const abs = Math.abs(delta).toLocaleString('es-CR', { maximumFractionDigits: 0 });
    return `${sign}₡${abs}`;
  });

  /** "Revisando carta X de Y" — only renders when there's a current batch and card. */
  protected readonly progressLabel = computed<string | null>(() => {
    const total = this.batchTotal();
    const summary = this.summary();
    const card = this.current();
    if (!total || total <= 0 || !summary || !card) return null;
    const remaining = summary.pending_count;
    if (remaining <= 0) return null;
    const position = Math.max(1, Math.min(total, total - remaining + 1));
    return `Revisando carta ${position} de ${total}`;
  });

  /** TCGplayer link to assist price review. Prefers the direct
   *  `/product/<id>` deep link when the snapshotted TCGplayer product id is
   *  available; falls back to a name search (`/search/pokemon/product?q=…`)
   *  when it isn't — TCGdex sometimes returns market pricing for older sets
   *  WITHOUT a productId (e-card era especially), and we'd rather hand the
   *  admin a search than no link at all. */
  protected readonly tcgplayerLink = computed<{ url: string; tooltip: string } | null>(() => {
    const card = this.current();
    if (!card) return null;
    if (card.tcgplayer_product_id) {
      return {
        url: `https://www.tcgplayer.com/product/${card.tcgplayer_product_id}`,
        tooltip: 'Ver en TCGplayer',
      };
    }
    const name = (card.product_name ?? '').trim();
    if (!name) return null;
    // Search fallback (TCGdex has no productId on this card) — include the
    // card number and set name so TCGplayer narrows to 1-3 matches rather
    // than every card sharing the name.
    const query = [name, card.card_number, card.set_name]
      .map((s) => (s ?? '').trim())
      .filter((s) => s.length > 0)
      .join(' ');
    return {
      url: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(query)}`,
      tooltip: 'Buscar en TCGplayer',
    };
  });

  /** Debounced floor value — feeds the qualifying-count effect. */
  private readonly floorDebounced = toSignal(
    toObservable(this.floorValue).pipe(debounceTime(250), distinctUntilChanged()),
    { initialValue: 0 },
  );

  constructor() {
    // Keep the signal in sync with the FormControl (one-way: control → signal).
    // Unsubscribe is automatic — DestroyRef would be needed only if we returned
    // a subscription outside the constructor.
    this.floorCtrl.valueChanges.subscribe((v) => {
      this.floorValue.set(Math.max(0, Number(v) || 0));
    });

    // Refresh the qualifying count whenever the (debounced) floor changes
    // AND the options panel is actually open. Skipping when closed avoids
    // a wasted query on every keystroke during a run.
    effect(() => {
      const floor = this.floorDebounced();
      if (this.phase() !== 'configuring') return;
      void this.refreshQualifyingCount(floor);
    });

    void this.refreshAll();
  }

  // ─── Card lifecycle ─────────────────────────────────────────────────────

  private async refreshAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [summary, next] = await Promise.all([
        this.reports.priceReviewSummary(),
        this.reports.priceReviewNext(),
      ]);
      this.summary.set(summary);
      this.current.set(next);
      if (next) {
        this.priceCtrl.setValue(next.suggested_price, { emitEvent: false });
        this.priceCtrl.markAsPristine();
      } else {
        this.priceCtrl.setValue(null, { emitEvent: false });
      }
      // Anchor the "X de Y" denominator. Set on first sight of a non-empty
      // queue and also whenever the queue grows beyond the prior total
      // (a fresh run completed; onStartRun also explicitly resets it).
      const current = this.batchTotal();
      if (summary.pending_count > 0 && (current == null || summary.pending_count > current)) {
        this.batchTotal.set(summary.pending_count);
      } else if (summary.pending_count === 0) {
        this.batchTotal.set(null);
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  private async refreshQualifyingCount(floor: number): Promise<void> {
    this.qualifyingCount.set(null);
    try {
      const n = await this.reports.priceReviewQualifyingCount(floor);
      // Stale-result guard: only commit if we're still configuring with this floor.
      if (this.phase() === 'configuring' && this.floorDebounced() === floor) {
        this.qualifyingCount.set(n);
      }
    } catch {
      this.qualifyingCount.set(null);
    }
  }

  protected async onIgnore(): Promise<void> {
    const card = this.current();
    if (!card || this.acting()) return;
    this.acting.set(true);
    try {
      await this.reports.priceReviewIgnore(card.product_id);
      await this.refreshAll();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.acting.set(false);
    }
  }

  protected async onAccept(): Promise<void> {
    const card = this.current();
    if (!card || this.acting()) return;
    if (this.priceCtrl.invalid || this.priceCtrl.value == null) {
      this.priceCtrl.markAsTouched();
      return;
    }
    this.acting.set(true);
    try {
      await this.reports.priceReviewAccept(card.product_id, Number(this.priceCtrl.value));
      this.snack.open('Precio actualizado', 'OK', { duration: 2500 });
      await this.refreshAll();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.acting.set(false);
    }
  }

  // ─── Manual run with overrides ──────────────────────────────────────────

  protected async onOpenOptions(): Promise<void> {
    if (this.phase() !== 'idle') return;
    // Pre-fill from current settings. If they can't be loaded we still open
    // the panel but with safe defaults — the user can re-enter.
    let threshold = 10;
    let floor = 5000;
    let enabled = true;
    let rateOk = true;
    try {
      const s = await this.settings.get();
      threshold = Number(s.price_review_threshold_pct) || threshold;
      floor = Number(s.price_review_floor_crc) || floor;
      enabled = !!s.price_review_enabled;
      rateOk = !!s.exchange_rate_usd_crc && Number(s.exchange_rate_usd_crc) > 0;
    } catch {
      // best-effort
    }
    if (!enabled) {
      this.snack.open(
        'La revisión de precios está desactivada en /admin/config.',
        'OK',
        { duration: 5000 },
      );
      return;
    }
    if (!rateOk) {
      this.snack.open(
        'Falta configurar el tipo de cambio en /admin/config antes de revisar precios.',
        'OK',
        { duration: 6000 },
      );
      return;
    }
    this.thresholdCtrl.setValue(threshold);
    this.floorCtrl.setValue(floor);
    this.floorValue.set(floor);
    this.qualifyingCount.set(null);
    this.phase.set('configuring');
    void this.refreshQualifyingCount(floor);
  }

  protected onCancelOptions(): void {
    if (this.phase() !== 'configuring') return;
    this.phase.set('idle');
    this.qualifyingCount.set(null);
  }

  protected async onStartRun(): Promise<void> {
    if (this.phase() !== 'configuring') return;
    if (this.thresholdCtrl.invalid || this.floorCtrl.invalid) {
      this.thresholdCtrl.markAsTouched();
      this.floorCtrl.markAsTouched();
      return;
    }
    const overrides = {
      threshold_pct: Number(this.thresholdCtrl.value),
      floor_crc: Number(this.floorCtrl.value),
    };
    this.phase.set('running');
    this.progress.set(null);
    // Reset the batch anchor so refreshAll() below will set it to the new
    // queue size (the fresh run's flagged count) instead of preserving the
    // pre-run denominator.
    this.batchTotal.set(null);
    try {
      const result = await this.reports.runPriceReviewNow(this.progress, overrides);
      this.snack.open(
        `Revisión completada: ${result.flagged} cartas marcadas de ${result.scanned} revisadas`,
        'OK',
        { duration: 5000 },
      );
      await this.refreshAll();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 6000 });
    } finally {
      this.phase.set('idle');
      this.progress.set(null);
    }
  }

  // ─── Formatters ─────────────────────────────────────────────────────────

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-CR', { year: 'numeric', month: 'short', day: '2-digit' });
  }

  protected formatRunStarted(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-CR', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected formatUsd(n: number): string {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  protected formatCrc(n: number): string {
    return n.toLocaleString('es-CR');
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = String((err as { message: unknown }).message ?? '');
      if (msg === 'NO_EXCHANGE_RATE') {
        return 'Falta configurar el tipo de cambio en /admin/config antes de revisar precios.';
      }
      if (msg === 'PRICE_REVIEW_DISABLED') {
        return 'La revisión de precios está desactivada en /admin/config.';
      }
      return msg || 'Error desconocido';
    }
    return 'Error desconocido';
  }
}
