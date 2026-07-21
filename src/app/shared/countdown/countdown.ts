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

/**
 * Live countdown to an auction's close ("2d 04:12:45" → "04:12:45" under a
 * day). Ticks every second and reacts when `endsAt` changes (anti-sniping
 * extensions push the target while the component is on screen). Emits
 * `finished` once when the target passes so the parent can flip its UI to
 * "Finalizada" / re-fetch state.
 */
@Component({
  selector: 'app-countdown',
  template: `{{ label() }}`,
  host: {
    '[class.is-ended]': 'ended()',
    '[class.is-soon]': 'soon()',
  },
})
export class Countdown {
  /** ISO timestamptz of the close. null = no target ("Por definir"). */
  readonly endsAt = input<string | null>(null);
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

  protected readonly label = computed(() => {
    const ms = this.remaining();
    if (ms === null) return 'Por definir';
    if (ms <= 0) return 'Finalizada';
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86_400);
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = pad(Math.floor((totalSec % 86_400) / 3600));
    const m = pad(Math.floor((totalSec % 3600) / 60));
    const s = pad(totalSec % 60);
    return days > 0 ? `${days}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
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
