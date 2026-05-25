import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

interface SparkGeom {
  points: string;
  area: string;
  /** Last-point vertical position as a % of height (0 = top). */
  dotY: number;
}

/** Tiny responsive trend chart — inline SVG, no charting dependency. Stretches
 *  to its container width via `preserveAspectRatio="none"`; the line keeps a
 *  constant stroke (`vector-effect`) and the end dot is an HTML element so it
 *  stays round regardless of the horizontal stretch. */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sparkline" [style.height.px]="height()">
      @if (geom(); as g) {
        <svg
          class="sparkline__svg"
          [attr.viewBox]="'0 0 100 ' + height()"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path class="sparkline__area" [attr.d]="g.area" [attr.fill]="stroke()" />
          <polyline
            class="sparkline__line"
            [attr.points]="g.points"
            [attr.stroke]="stroke()"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <span
          class="sparkline__dot"
          [style.top.%]="g.dotY"
          [style.background]="stroke()"
        ></span>
      }
    </div>
  `,
  styles: [
    `
      .sparkline {
        position: relative;
        width: 100%;
      }
      .sparkline__svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .sparkline__line {
        fill: none;
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .sparkline__area {
        stroke: none;
        fill-opacity: 0.12;
      }
      .sparkline__dot {
        position: absolute;
        right: 0;
        width: 7px;
        height: 7px;
        border-radius: 999px;
        transform: translate(50%, -50%);
        box-shadow: 0 0 0 2px var(--surface-card);
      }
    `,
  ],
})
export class Sparkline {
  readonly values = input<number[]>([]);
  /** Drawing height in px (also the SVG viewBox height). */
  readonly height = input(44);
  readonly stroke = input('var(--mat-sys-primary)');

  protected readonly geom = computed<SparkGeom | null>(() => {
    const vals = this.values();
    const h = this.height();
    const n = vals.length;
    if (n === 0) return null;

    const pad = 4;
    const usable = h - pad * 2;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    const xy = vals.map((v, i) => {
      const x = n === 1 ? 100 : (i / (n - 1)) * 100;
      const norm = range === 0 ? 0.5 : (v - min) / range;
      const y = h - pad - norm * usable;
      return { x: round(x), y: round(y) };
    });

    const points = xy.map((p) => `${p.x},${p.y}`).join(' ');
    const area = `M ${xy.map((p) => `${p.x},${p.y}`).join(' L ')} L 100,${h} L 0,${h} Z`;
    const last = xy[xy.length - 1];
    return { points, area, dotY: round((last.y / h) * 100) };
  });
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
