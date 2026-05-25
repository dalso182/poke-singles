import { Component, computed, inject, signal } from '@angular/core';
import { CategoriesService } from '../../core/catalog/categories.service';
import { CardTypesService } from '../../core/catalog/card-types.service';
import { CardTypes } from '../card-types/card-types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { UnderlineTabs } from '../../shared/table/tabs/underline-tabs/underline-tabs';
import type { TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';

/**
 * Admin "Filtros" screen — one classification list per category, switched via
 * underlined section tabs:
 *  - Singles: the global Rareza tags (category_id NULL, multi-select on products).
 *  - Producto sellado / Accesorios: per-category sub-types (single-select).
 * Each tab drives a single CardTypes CRUD, scoped by category id.
 */
@Component({
  selector: 'app-admin-filters',
  imports: [CardTypes, PageHeader, UnderlineTabs],
  templateUrl: './filters.html',
  styleUrl: './filters.scss',
})
export class Filters {
  private readonly categoriesService = inject(CategoriesService);
  private readonly cardTypesService = inject(CardTypesService);

  protected readonly tab = signal('singles');
  protected readonly selladoId = signal<string | null>(null);
  protected readonly accesoriosId = signal<string | null>(null);
  protected readonly counts = signal({ singles: 0, sellado: 0, accesorios: 0 });

  protected readonly tabs = computed<TabItem[]>(() => {
    const c = this.counts();
    return [
      { key: 'singles', label: 'Singles', count: c.singles },
      { key: 'sellado', label: 'Producto sellado', count: c.sellado },
      { key: 'accesorios', label: 'Accesorios', count: c.accesorios },
    ];
  });

  protected readonly activeCategoryId = computed<string | null>(() => {
    switch (this.tab()) {
      case 'sellado':
        return this.selladoId();
      case 'accesorios':
        return this.accesoriosId();
      default:
        return null; // singles → global
    }
  });

  protected readonly activeSlugPrefix = computed(() => {
    switch (this.tab()) {
      case 'sellado':
        return 'sellado-';
      case 'accesorios':
        return 'acc-';
      default:
        return '';
    }
  });

  /** Singles is always ready; category tabs wait for their id to resolve. */
  protected readonly ready = computed(() =>
    this.tab() === 'singles' ? true : this.activeCategoryId() != null,
  );

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const cats = await this.categoriesService.list();
      this.selladoId.set(cats.find((c) => c.slug === 'sellado')?.id ?? null);
      this.accesoriosId.set(cats.find((c) => c.slug === 'accesorios')?.id ?? null);
    } catch {
      // Best-effort — the Singles tab still works without the category ids.
    }
    await this.reloadCounts();
  }

  protected async reloadCounts(): Promise<void> {
    const sId = this.selladoId();
    const aId = this.accesoriosId();
    try {
      const [singles, sellado, accesorios] = await Promise.all([
        this.cardTypesService.list({ categoryId: null }),
        sId ? this.cardTypesService.list({ categoryId: sId }) : Promise.resolve([]),
        aId ? this.cardTypesService.list({ categoryId: aId }) : Promise.resolve([]),
      ]);
      this.counts.set({
        singles: singles.length,
        sellado: sellado.length,
        accesorios: accesorios.length,
      });
    } catch {
      // Counts are decorative; leave them as-is on failure.
    }
  }
}
