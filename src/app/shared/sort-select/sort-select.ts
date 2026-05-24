import { Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type { SortKey } from '../../core/catalog/catalog.types';

/**
 * Reusable "Ordenar por" control for the product listings (/products, /buscar).
 * Presentational only — the parent owns the value (URL-bound) and reacts to
 * `sortChange` by navigating. Right-aligns itself as a flex item, so it drops
 * neatly onto the same row as the Set/Rareza filters inside `<app-filters-bar>`.
 */
@Component({
  selector: 'app-sort-select',
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './sort-select.html',
  styleUrl: './sort-select.scss',
})
export class SortSelect {
  /** Current sort key (owned by the parent — typically the URL `sort` param). */
  readonly value = input.required<SortKey>();
  /** Show "Relevancia" — only meaningful when there's a search query. */
  readonly showRelevance = input<boolean>(false);
  readonly sortChange = output<SortKey>();
}
