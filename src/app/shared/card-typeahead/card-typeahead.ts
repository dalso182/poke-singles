import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Query } from '@tcgdex/sdk';
import type { Card, CardResume } from '@tcgdex/sdk';
import { TcgdexService } from '../../core/tcgdex/tcgdex.service';

@Component({
  selector: 'app-card-typeahead',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './card-typeahead.html',
  styleUrl: './card-typeahead.scss',
})
export class CardTypeahead {
  readonly placeholder = input<string>('Buscar cartas…');
  /** TCGdex set id (e.g. "sv05"). When set, narrows results to that set. */
  readonly setCode = input<string | null>(null);
  readonly cardSelected = output<Card>();

  private readonly tcgdex = inject(TcgdexService);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly searching = signal(false);

  protected readonly suggestions = toSignal(
    combineLatest([
      this.searchControl.valueChanges.pipe(
        // Material autocomplete writes the selected object back into the control;
        // ignore non-string emissions so .trim() doesn't blow up.
        filter((value): value is string => typeof value === 'string'),
        debounceTime(250),
        distinctUntilChanged(),
        startWith(''),
      ),
      toObservable(this.setCode),
    ]).pipe(
      tap(() => this.searching.set(true)),
      switchMap(async ([value, setCode]) => {
        const q = value.trim();
        if (q.length < 2) return [] as CardResume[];
        try {
          let query = Query.create().contains('name', q);
          if (setCode) query = query.equal('set.id', setCode);
          return await this.tcgdex.client.card.list(query.paginate(1, 12));
        } catch {
          return [] as CardResume[];
        }
      }),
      tap(() => this.searching.set(false)),
    ),
    { initialValue: [] as CardResume[] },
  );

  protected displayCardName(card: CardResume | string | null): string {
    if (!card) return '';
    return typeof card === 'string' ? card : card.name;
  }

  protected thumbUrl(card: CardResume): string | null {
    return card.image ? `${card.image}/low.webp` : null;
  }

  protected async onSelect(event: MatAutocompleteSelectedEvent): Promise<void> {
    const resume = event.option.value as CardResume;
    this.searchControl.setValue(resume.name, { emitEvent: false });
    try {
      // Use the low-level `fetch` (raw JSON) rather than `card.get` (a Card
      // model instance): the model carries an `sdk` back-reference to the
      // TCGdex client, which makes JSON.stringify throw a circular-structure
      // error when the payload is later cached to `tcgdex_cards`. This mirrors
      // the seed script's path (scripts/seed-products.mjs).
      const detail = await this.tcgdex.client.fetch('cards', resume.id);
      if (detail) this.cardSelected.emit(detail);
    } catch (err) {
      console.error('[card-typeahead] failed to fetch card detail:', err);
    }
  }
}
