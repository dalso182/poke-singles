import {
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PokemonService, type Pokemon } from '../../../core/pokemon/pokemon.service';

export interface AvatarPickerData {
  /** The dex number currently saved on the profile (highlighted on open). */
  current: number | null;
}

/** How many tiles to add per scroll step. */
const PAGE = 60;

@Component({
  selector: 'app-avatar-picker-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  templateUrl: './avatar-picker-dialog.html',
  styleUrl: './avatar-picker-dialog.scss',
})
export class AvatarPickerDialog implements OnDestroy {
  private readonly pokemon = inject(PokemonService);
  private readonly dialogRef =
    inject<MatDialogRef<AvatarPickerDialog, number | null>>(MatDialogRef);
  protected readonly data = inject<AvatarPickerData>(MAT_DIALOG_DATA);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly all = signal<Pokemon[]>([]);
  protected readonly loading = signal(true);
  protected readonly visibleCount = signal(PAGE);
  protected readonly selected = signal<number | null>(this.data.current);

  private readonly query = toSignal(this.searchControl.valueChanges, {
    initialValue: '',
  });

  /** Full filtered list — matches the display name or the dex number,
   *  accent-insensitive (same normalize() idiom as the set typeahead). */
  protected readonly filtered = computed<Pokemon[]>(() => {
    const raw = this.query();
    const list = this.all();
    const q = typeof raw === 'string' ? this.normalize(raw) : '';
    if (!q) return list;
    return list.filter(
      (p) =>
        this.normalize(p.displayName).includes(q) || String(p.number).includes(q),
    );
  });

  /** The slice actually rendered; grows on scroll. */
  protected readonly visible = computed<Pokemon[]>(() =>
    this.filtered().slice(0, this.visibleCount()),
  );

  protected readonly hasMore = computed(
    () => this.visible().length < this.filtered().length,
  );

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private observer: IntersectionObserver | null = null;

  constructor() {
    void this.load();

    // A new search starts from the top of the list.
    effect(() => {
      this.query();
      this.visibleCount.set(PAGE);
    });

    // Infinite scroll: grow the window when the bottom sentinel comes into
    // view. A dialog only ever renders in the browser, but guard anyway per the
    // window/document convention.
    effect(() => {
      const el = this.sentinel()?.nativeElement;
      if (!el || !this.isBrowser || this.observer) return;
      // The list scrolls inside <mat-dialog-content>, so observe against it
      // (falls back to the viewport if the host markup ever changes).
      const root = el.closest('mat-dialog-content') as HTMLElement | null;
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting) && this.hasMore()) {
            this.visibleCount.update((n) => n + PAGE);
          }
        },
        { root, rootMargin: '300px' },
      );
      this.observer.observe(el);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private async load(): Promise<void> {
    try {
      this.all.set(await this.pokemon.list());
    } finally {
      this.loading.set(false);
    }
  }

  protected avatarUrl(n: number): string {
    // Neutral (Normal) portrait — the picker is for choosing a species, so the
    // cart-total mood doesn't apply to the grid tiles.
    return this.pokemon.portraitUrl(n);
  }

  protected pick(n: number): void {
    this.dialogRef.close(n);
  }

  protected onCancel(): void {
    this.dialogRef.close(null);
  }

  /** Artwork is added incrementally — hide a missing PNG so the dex-number
   *  placeholder behind it shows instead of a broken-image glyph. */
  protected onImgError(ev: Event): void {
    (ev.target as HTMLImageElement).style.visibility = 'hidden';
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }
}
