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
import type { Card, CardResume, SetResume } from '@tcgdex/sdk';
import { TcgdexService } from '../../core/tcgdex/tcgdex.service';

export interface CardNumberQuery {
  /** Normalized TCGdex localId — the numerator printed on the card (e.g. "112", "TG12"). */
  localId: string;
  /** The printed set total — the denominator (e.g. 125). */
  total: number;
}

/**
 * Recognizes a card-number query like "112/125", "004/102" or "TG01/TG30".
 * The numerator is normalized to TCGdex localId format: alpha prefix
 * uppercased; leading zeros stripped for pure-numeric ids (the API accepts
 * either) but preserved after a prefix, where the API is padding-sensitive
 * (`TG1` 404s, `TG01` hits). Returns null for anything else (→ name search).
 */
export function parseCardNumberQuery(q: string): CardNumberQuery | null {
  const match = /^([A-Za-z]{0,4})(\d+)\s*\/\s*[A-Za-z]{0,4}(\d+)$/.exec(q.trim());
  if (!match) return null;
  return {
    localId: normalizeLocalId(match[1], match[2]),
    total: parseInt(match[3], 10),
  };
}

function normalizeLocalId(alphaPrefix: string, digits: string): string {
  const prefix = alphaPrefix.toUpperCase();
  return prefix ? prefix + digits : digits.replace(/^0+(?=\d)/, '');
}

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
        try {
          // "112/125" → look the card up by printed number + set total instead
          // of by name; the numerator/denominator pair usually pins it down to
          // one or two candidates.
          const numberQuery = parseCardNumberQuery(q);
          if (numberQuery) return await this.searchByNumber(numberQuery);

          // With a set already picked, a bare number ("112", "TG12", promo
          // "SWSH123") is a localId lookup within that set + its gallery subsets.
          if (setCode) {
            const bare = /^([A-Za-z]{0,4})(\d+)$/.exec(q);
            if (bare) {
              const setIds = [setCode, ...(await this.subsetIdsFor(setCode))];
              return await this.searchByLocalId(normalizeLocalId(bare[1], bare[2]), setIds);
            }
          }

          if (q.length < 2) return [] as CardResume[];
          // TCGdex models the SWSH gallery subsets (Trainer Gallery, Galarian
          // Gallery, Shiny Vault) as separate sets, so a plain set.id filter
          // would hide e.g. Crown Zenith's GG cards. Query the base set and
          // its gallery subsets together.
          const setIds = setCode ? [setCode, ...(await this.subsetIdsFor(setCode))] : [null];
          const results = await Promise.all(
            setIds.map((id) => {
              let query = Query.create().contains('name', q).paginate(1, 30);
              if (id) query = query.equal('set.id', id);
              return this.tcgdex.client.card.list(query);
            }),
          );
          return results.flat();
        } catch {
          return [] as CardResume[];
        }
      }),
      tap(() => this.searching.set(false)),
    ),
    { initialValue: [] as CardResume[] },
  );

  private setListPromise?: Promise<SetResume[]>;
  /** setId → set name, populated once the TCGdex set list resolves. */
  protected readonly setNames = signal<ReadonlyMap<string, string>>(new Map());

  constructor() {
    // Prime the set list so option rows can label results with set names.
    void this.allSets()
      .then((sets) => this.setNames.set(new Map(sets.map((s) => [s.id, s.name]))))
      .catch(() => {});
  }

  private allSets(): Promise<SetResume[]> {
    this.setListPromise ??= this.tcgdex.client.set.list().catch((err) => {
      // Don't cache a failed fetch — retry on the next call.
      this.setListPromise = undefined;
      throw err;
    });
    return this.setListPromise;
  }

  /**
   * Gallery subsets are named `<base set name> + suffix` — id prefixes are
   * unreliable (swsh12.5tg is Silver Tempest's gallery, not Crown Zenith's;
   * sma is Hidden Fates Shiny Vault), so match on names instead.
   */
  private async subsetIdsFor(setCode: string): Promise<string[]> {
    const suffixes = [' Trainer Gallery', ' Galarian Gallery', ' Shiny Vault'];
    try {
      const sets = await this.allSets();
      const base = sets.find((s) => s.id === setCode);
      if (!base) return [];
      return sets
        .filter((s) => suffixes.some((suffix) => s.name === base.name + suffix))
        .map((s) => s.id);
    } catch {
      return [];
    }
  }

  /**
   * Card-number search: sets whose printed total (`cardCount.official`)
   * matches the denominator are the candidates; the numerator is then looked
   * up per candidate set (fan-out is small — at most ~18 sets share a total).
   */
  private async searchByNumber({ localId, total }: CardNumberQuery): Promise<CardResume[]> {
    const sets = await this.allSets();
    const candidateIds = sets.filter((s) => s.cardCount.official === total).map((s) => s.id);
    if (candidateIds.length === 0) return [];
    return await this.searchByLocalId(localId, candidateIds);
  }

  /**
   * `localId` must be pre-normalized (via `parseCardNumberQuery`/the bare-number
   * regex). Uses the direct `/sets/{id}/{localId}` endpoint — exact per set,
   * unlike the list filters, whose `eq:` misses numeric localIds and whose
   * plain form is a substring match ("4" also hits "14", "40"…).
   */
  private async searchByLocalId(localId: string, setIds: string[]): Promise<CardResume[]> {
    const results = await Promise.all(
      setIds.map((id) => this.tcgdex.client.fetch('sets', id, localId).catch(() => undefined)),
    );
    return results.filter((card): card is Card => !!card);
  }

  private setIdOf(cardId: string): string {
    const sep = cardId.lastIndexOf('-');
    return sep > 0 ? cardId.slice(0, sep) : '';
  }

  /** "Set name · #localId" when the set list is loaded; raw card id until then. */
  protected setLabel(card: CardResume): string {
    const name = this.setNames().get(this.setIdOf(card.id));
    return name ? `${name} · #${card.localId}` : card.id;
  }

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
