import { Component, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap } from 'rxjs';
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
  readonly cardSelected = output<Card>();

  private readonly tcgdex = inject(TcgdexService);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly searching = signal(false);

  protected readonly suggestions = toSignal(
    this.searchControl.valueChanges.pipe(
      // Material autocomplete writes the selected object back into the control;
      // ignore non-string emissions so .trim() doesn't blow up.
      filter((value): value is string => typeof value === 'string'),
      debounceTime(250),
      distinctUntilChanged(),
      tap(() => this.searching.set(true)),
      switchMap(async (value) => {
        const q = value.trim();
        if (q.length < 2) return [] as CardResume[];
        try {
          return await this.tcgdex.client.card.list(
            Query.create().contains('name', q).paginate(1, 8),
          );
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
    console.log('[card-typeahead] selected resume:', resume);
    this.searchControl.setValue(resume.name, { emitEvent: false });
    try {
      const detail = await this.tcgdex.client.card.get(resume.id);
      console.log('[card-typeahead] full card detail:', detail);
      if (detail) this.cardSelected.emit(detail);
    } catch (err) {
      console.error('[card-typeahead] failed to fetch card detail:', err);
    }
  }
}
