import { Component, computed, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import type { SetRow } from '../../../core/catalog/catalog.types';

interface VisibleSet {
  id: string;
  name: string;
  code: string;
  symbolUrl: string | null;
  count: number;
  releaseDate: string | null;
}

@Component({
  selector: 'app-set-filter',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
  ],
  templateUrl: './set-filter.html',
  styleUrl: './set-filter.scss',
})
export class SetFilter {
  readonly sets = input.required<SetRow[]>();
  readonly counts = input<Map<string, number>>(new Map());
  readonly selected = input.required<string[]>();
  readonly hideZero = input<boolean>(true);

  readonly selectionChange = output<string[]>();

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(100), distinctUntilChanged()),
    { initialValue: '' },
  );

  /** Selection mirrored as a Set for O(1) toggle / lookup, kept in sync with
   *  the `selected` input via a computed below. */
  private readonly selectedSet = computed<Set<string>>(() => new Set(this.selected()));

  protected readonly visibleSets = computed<VisibleSet[]>(() => {
    const q = (this.searchValue() ?? '').trim().toLowerCase();
    const counts = this.counts();
    const hide = this.hideZero();
    const sel = this.selectedSet();
    return this.sets()
      .map<VisibleSet>((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        symbolUrl: s.symbol_image_url || null,
        count: counts.get(s.id) ?? 0,
        releaseDate: s.release_date,
      }))
      // Keep selected rows visible even if their count is 0 (so the user
      // can still uncheck them after admin changes availability).
      .filter((s) => (hide ? s.count > 0 || sel.has(s.id) : true))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
      // Newest sets first; ISO date strings sort chronologically. Sets with no
      // date sink to the bottom, name breaks ties.
      .sort((a, b) => {
        if (a.releaseDate !== b.releaseDate) {
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return b.releaseDate.localeCompare(a.releaseDate);
        }
        return a.name.localeCompare(b.name);
      });
  });

  protected readonly selectedCount = computed<number>(() => this.selected().length);

  protected isChecked(id: string): boolean {
    return this.selectedSet().has(id);
  }

  protected toggle(id: string, checked: boolean, event?: Event): void {
    // Stop click bubbling so the mat-menu doesn't close on every check.
    event?.stopPropagation();
    const next = new Set(this.selectedSet());
    if (checked) next.add(id);
    else next.delete(id);
    this.selectionChange.emit([...next]);
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.searchControl.setValue('');
    this.selectionChange.emit([]);
  }
}
