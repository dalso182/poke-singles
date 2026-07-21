import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

interface CountdownParts {
  d: string;
  hh: string;
  mm: string;
  ss: string;
}

/**
 * Live countdown to an auction's close. Ticks every second and reacts when
 * `endsAt` changes (anti-sniping extensions push the target while the
 * component is on screen — the value can jump UP, that's expected). Emits
 * `finished` once per zero-crossing so the parent can flip its UI.
 *
 * Variants (Live Arena handoff):
 * - `inline` (default): "2d 04:12:45" → "Finalizada" / "Por definir".
 * - `chip`: segmented mono chip "1d · 13h · 17m · 20s" for auction tiles.
 * - `tiles`: four big DD : HH : MM : SS tiles for the dark arena hero
 *   (parent supplies the dark surface; tile colors are arena-scoped).
 */
@Component({
  selector: 'app-countdown',
  template: `
    @switch (variant()) {
      @case ('chip') {
        @if (parts(); as p) {
          <span class="cd-chip">
            <span class="cd-seg">{{ p.d }}<i>d</i></span>
            <span class="cd-dot">·</span>
            <span class="cd-seg">{{ p.hh }}<i>h</i></span>
            <span class="cd-dot">·</span>
            <span class="cd-seg">{{ p.mm }}<i>m</i></span>
            <span class="cd-dot">·</span>
            <span class="cd-seg">{{ p.ss }}<i>s</i></span>
          </span>
        } @else {
          <span class="cd-chip cd-chip--label">{{ label() }}</span>
        }
      }
      @case ('tiles') {
        @if (parts(); as p) {
          <span class="cd-tiles">
            <span class="cd-tile-col">
              <span class="cd-tile">{{ p.d }}</span>
              <span class="cd-tile-label">días</span>
            </span>
            <span class="cd-colon">:</span>
            <span class="cd-tile-col">
              <span class="cd-tile">{{ p.hh }}</span>
              <span class="cd-tile-label">horas</span>
            </span>
            <span class="cd-colon">:</span>
            <span class="cd-tile-col">
              <span class="cd-tile">{{ p.mm }}</span>
              <span class="cd-tile-label">min</span>
            </span>
            <span class="cd-colon">:</span>
            <span class="cd-tile-col">
              <span class="cd-tile">{{ p.ss }}</span>
              <span class="cd-tile-label">seg</span>
            </span>
          </span>
        } @else {
          <span class="cd-tiles-label">{{ label() }}</span>
        }
      }
      @default {
        {{ label() }}
      }
    }
  `,
  styles: `
    // ---- chip (cream surfaces: auction tiles) ----
    .cd-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 8px;
      background: var(--surface-tonal);
      border: 1px solid var(--border-subtle);
    }

    .cd-seg {
      display: inline-flex;
      align-items: baseline;
      gap: 2px;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-variant-numeric: tabular-nums;

      i {
        font-style: normal;
        font-size: 9.5px;
        color: var(--text-tertiary);
      }
    }

    .cd-dot {
      color: var(--border-strong);
    }

    .cd-chip--label {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
      color: var(--text-tertiary);
      letter-spacing: 0.6px;
    }

    // ---- tiles (dark arena hero only) ----
    .cd-tiles {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .cd-tile-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .cd-tile {
      min-width: 62px;
      padding: 12px 8px;
      border-radius: 10px;
      background: linear-gradient(180deg, #26262c, #1b1b20);
      border: 1px solid rgba(255, 255, 255, 0.09);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      font-family: var(--font-mono);
      font-size: 32px;
      font-weight: 600;
      letter-spacing: -1px;
      line-height: 1;
      color: #f6e7c4;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .cd-tile-label {
      font-family: var(--font-mono);
      font-size: 9px;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
    }

    .cd-colon {
      font-family: var(--font-mono);
      font-size: 30px;
      color: rgba(255, 255, 255, 0.25);
      margin-top: 8px;
    }

    .cd-tiles-label {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.14);
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.6);
    }

    @media (max-width: 959.98px) {
      .cd-tile {
        min-width: 52px;
        font-size: 26px;
      }
    }
  `,
  host: {
    '[class.is-ended]': 'ended()',
    '[class.is-soon]': 'soon()',
  },
})
export class Countdown {
  /** ISO timestamptz of the close. null = no target ("Por definir"). */
  readonly endsAt = input<string | null>(null);
  /** Visual variant — see class docs. */
  readonly variant = input<'inline' | 'chip' | 'tiles'>('inline');
  /** Fires once each time the countdown crosses zero. */
  readonly finished = output<void>();

  private readonly now = signal(Date.now());
  private wasEnded = false;

  /** Milliseconds remaining; null when there's no (valid) target. */
  private readonly remaining = computed<number | null>(() => {
    const iso = this.endsAt();
    if (!iso) return null;
    const target = Date.parse(iso);
    if (Number.isNaN(target)) return null;
    return target - this.now();
  });

  /** Zero-padded d/hh/mm/ss segments; null when missing target or ended. */
  protected readonly parts = computed<CountdownParts | null>(() => {
    const ms = this.remaining();
    if (ms === null || ms <= 0) return null;
    const totalSec = Math.floor(ms / 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      d: String(Math.floor(totalSec / 86_400)),
      hh: pad(Math.floor((totalSec % 86_400) / 3600)),
      mm: pad(Math.floor((totalSec % 3600) / 60)),
      ss: pad(totalSec % 60),
    };
  });

  protected readonly label = computed(() => {
    const ms = this.remaining();
    if (ms === null) return 'Por definir';
    if (ms <= 0) return 'Finalizada';
    const p = this.parts()!;
    return Number(p.d) > 0 ? `${p.d}d ${p.hh}:${p.mm}:${p.ss}` : `${p.hh}:${p.mm}:${p.ss}`;
  });

  readonly ended = computed(() => {
    const ms = this.remaining();
    return ms !== null && ms <= 0;
  });

  /** Under an hour left — parents style this as the "urgent" state. */
  readonly soon = computed(() => {
    const ms = this.remaining();
    return ms !== null && ms > 0 && ms < 3_600_000;
  });

  constructor() {
    const id = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
    effect(() => {
      const e = this.ended();
      if (e && !this.wasEnded) {
        this.wasEnded = true;
        this.finished.emit();
      } else if (!e) {
        this.wasEnded = false;
      }
    });
  }
}
