import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Thin horizontal strip that hosts filter trigger components. The bar
 * itself is content-projected so each page composes whatever filters it
 * wants (Set, Condition, Rarity, etc.) — v1 callers only project the
 * Set filter. The bar surfaces a "Limpiar todo" button whenever the
 * caller signals there's an active filter.
 */
@Component({
  selector: 'app-filters-bar',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './filters-bar.html',
  styleUrl: './filters-bar.scss',
})
export class FiltersBar {
  readonly anyActive = input<boolean>(false);
  readonly clearAll = output<void>();

  protected onClearAll(): void {
    this.clearAll.emit();
  }
}
