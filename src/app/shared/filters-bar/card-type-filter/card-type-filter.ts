import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import type { CardTypeRow } from '../../../core/catalog/catalog.types';

interface VisibleCardType {
  id: string;
  name: string;
  count: number;
}

@Component({
  selector: 'app-card-type-filter',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatMenuModule,
  ],
  templateUrl: './card-type-filter.html',
  styleUrl: './card-type-filter.scss',
})
export class CardTypeFilter {
  readonly cardTypes = input.required<CardTypeRow[]>();
  readonly counts = input<Map<string, number>>(new Map());
  readonly selected = input.required<string[]>();
  readonly hideZero = input<boolean>(true);

  readonly selectionChange = output<string[]>();

  private readonly selectedSet = computed<Set<string>>(() => new Set(this.selected()));

  protected readonly visibleTypes = computed<VisibleCardType[]>(() => {
    const counts = this.counts();
    const hide = this.hideZero();
    const sel = this.selectedSet();
    return this.cardTypes()
      .map<VisibleCardType>((t) => ({
        id: t.id,
        name: t.name,
        count: counts.get(t.id) ?? 0,
      }))
      // Keep selected types visible even if their count is 0 (so the
      // user can still uncheck them when search results narrow).
      .filter((t) => (hide ? t.count > 0 || sel.has(t.id) : true));
    // No re-sort — card_types already ordered by sort_order + name on the
    // server, and that order is what the admin curates.
  });

  protected readonly selectedCount = computed<number>(() => this.selected().length);

  protected isChecked(id: string): boolean {
    return this.selectedSet().has(id);
  }

  protected toggle(id: string, checked: boolean, event?: Event): void {
    event?.stopPropagation();
    const next = new Set(this.selectedSet());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectionChange.emit([...next]);
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.selectionChange.emit([]);
  }
}
