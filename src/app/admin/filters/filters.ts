import { Component, inject, signal } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { CategoriesService } from '../../core/catalog/categories.service';
import { CardTypes } from '../card-types/card-types';

/**
 * Admin "Filtros" screen — one classification list per category, as tabs:
 *  - Singles: the global Rareza tags (category_id NULL, multi-select on products).
 *  - Producto sellado / Accesorios: per-category sub-types (single-select).
 * Each tab reuses the CardTypes CRUD, scoped by category id.
 */
@Component({
  selector: 'app-admin-filters',
  imports: [MatTabsModule, CardTypes],
  templateUrl: './filters.html',
  styleUrl: './filters.scss',
})
export class Filters {
  private readonly categoriesService = inject(CategoriesService);

  protected readonly selladoId = signal<string | null>(null);
  protected readonly accesoriosId = signal<string | null>(null);

  constructor() {
    void this.loadCategoryIds();
  }

  private async loadCategoryIds(): Promise<void> {
    try {
      const cats = await this.categoriesService.list();
      this.selladoId.set(cats.find((c) => c.slug === 'sellado')?.id ?? null);
      this.accesoriosId.set(cats.find((c) => c.slug === 'accesorios')?.id ?? null);
    } catch {
      // Best-effort — the Singles tab still works without the category ids.
    }
  }
}
