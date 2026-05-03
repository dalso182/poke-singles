import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ProductsService } from '../../core/catalog/products.service';
import type { ProductSearchRow, SortKey } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-search-results',
  imports: [
    RouterLink,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './search-results.html',
  styleUrl: './search-results.scss',
})
export class SearchResults {
  // URL-bound via withComponentInputBinding(). Empty defaults handle the
  // "browse via /buscar with no params" case.
  readonly q = input<string>('');
  readonly sort = input<string>('');

  private readonly products = inject(ProductsService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly results = signal<ProductSearchRow[]>([]);
  protected readonly loading = signal(false);

  /** Resolves the URL's raw `sort` param to a known SortKey, falling back to
   *  the per-context default (relevance with a query, recent without). */
  protected readonly normalizedSort = computed<SortKey>(() => {
    const v = this.sort();
    if (v === 'price-asc' || v === 'price-desc' || v === 'recent' || v === 'relevance') {
      return v;
    }
    return this.q().trim() ? 'relevance' : 'recent';
  });

  protected readonly hasQuery = computed(() => this.q().trim().length > 0);

  constructor() {
    effect(() => {
      const q = this.q().trim();
      const sort = this.normalizedSort();
      void this.fetch(q, sort);
    });
  }

  private async fetch(q: string, sort: SortKey): Promise<void> {
    this.loading.set(true);
    try {
      const { rows } = await this.products.search({ q, sort, pageSize: 60 });
      this.results.set(rows);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
      this.results.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected onSortChange(next: SortKey): void {
    void this.router.navigate(['/buscar'], {
      queryParams: { q: this.q() || null, sort: next },
      queryParamsHandling: 'merge',
    });
  }

  protected metaLine(card: ProductSearchRow): string {
    const parts = [
      card.set_name ?? '',
      card.rarity ?? '',
      card.card_number ? `#${card.card_number}` : '',
    ].filter((s) => s && s.length > 0);
    return parts.join(', ');
  }

  protected conditionClass(condition: string | null): string {
    if (!condition) return '';
    const code = condition.toUpperCase();
    let modifier = '';
    if (code === 'NM') modifier = 'condition-pill--nm';
    else if (code === 'LP') modifier = 'condition-pill--lp';
    else if (code === 'MP') modifier = 'condition-pill--mp';
    else if (code === 'HP' || code === 'DMG') modifier = 'condition-pill--hp';
    return `condition-pill ${modifier}`;
  }

  /** Resolve a TCGdex type name to the matching icon under assets/images/types.
   *  TCGdex uses "Lightning"/"Darkness"/"Metal" while the icons are named
   *  electric/dark/steel — handle both spellings. */
  protected typeIconUrl(type: string | null): string | null {
    if (!type) return null;
    const slug = TYPE_ICON_MAP[type];
    return slug ? `assets/images/types/${slug}.png` : null;
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}

const TYPE_ICON_MAP: Record<string, string> = {
  Colorless: 'colorless',
  Darkness: 'dark',
  Dark: 'dark',
  Dragon: 'dragon',
  Lightning: 'electric',
  Electric: 'electric',
  Fairy: 'fairy',
  Fighting: 'fighting',
  Fire: 'fire',
  Grass: 'grass',
  Psychic: 'psychic',
  Metal: 'steel',
  Steel: 'steel',
  Water: 'water',
};
