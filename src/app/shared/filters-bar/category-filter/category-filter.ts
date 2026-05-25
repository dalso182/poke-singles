import { Component, computed, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import type { CategoryRow } from '../../../core/catalog/catalog.types';

interface VisibleCategory {
  slug: string;
  name: string;
  count: number;
}

/**
 * Single-select category facet for the all-products listing. Unlike the set /
 * card-type filters (multi-select checkboxes), a product belongs to exactly one
 * category, so this is a radio-style pick-one (re-clicking the active row clears
 * back to "all"). All active categories are shown including zero-count ones.
 */
@Component({
  selector: 'app-category-filter',
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './category-filter.html',
  styleUrl: './category-filter.scss',
})
export class CategoryFilter {
  readonly categories = input.required<CategoryRow[]>();
  /** Counts keyed by category_id. */
  readonly counts = input<Map<string, number>>(new Map());
  /** Selected category slug, or null for "all". */
  readonly selected = input<string | null>(null);

  readonly selectionChange = output<string | null>();

  // Single-select: close the dropdown on pick so the filtered grid (which the
  // open menu overlaps) is revealed immediately.
  private readonly menuTrigger = viewChild(MatMenuTrigger);

  protected readonly visibleCategories = computed<VisibleCategory[]>(() => {
    const counts = this.counts();
    return this.categories().map((c) => ({
      slug: c.slug,
      name: c.name,
      count: counts.get(c.id) ?? 0,
    }));
  });

  protected readonly selectedName = computed<string | null>(() => {
    const slug = this.selected();
    if (!slug) return null;
    return this.categories().find((c) => c.slug === slug)?.name ?? slug;
  });

  protected isSelected(slug: string): boolean {
    return this.selected() === slug;
  }

  protected choose(slug: string): void {
    // Re-selecting the active category clears it (back to "all").
    this.selectionChange.emit(this.selected() === slug ? null : slug);
    this.menuTrigger()?.closeMenu();
  }

  protected clear(): void {
    this.selectionChange.emit(null);
    this.menuTrigger()?.closeMenu();
  }
}
