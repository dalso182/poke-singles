import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { SetsService } from '../../core/catalog/sets.service';
import type { SetRow } from '../../core/catalog/catalog.types';

const MAX_SUGGESTIONS = 12;

@Component({
  selector: 'app-set-typeahead',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './set-typeahead.html',
  styleUrl: './set-typeahead.scss',
})
export class SetTypeahead {
  readonly value = input<string | null>(null);
  readonly placeholder = input<string>('Buscar set…');
  readonly label = input<string>('Set');
  readonly required = input<boolean>(false);
  readonly valueChange = output<string | null>();

  private readonly sets = inject(SetsService);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly setsList = signal<SetRow[]>([]);
  protected readonly setsById = computed(() => {
    const map = new Map<string, SetRow>();
    for (const s of this.setsList()) map.set(s.id, s);
    return map;
  });

  private readonly searchValue = toSignal(this.searchControl.valueChanges, {
    initialValue: '',
  });

  protected readonly suggestions = computed<SetRow[]>(() => {
    const raw = this.searchValue();
    const list = this.setsList();
    // After a selection, Material writes the SetRow back into the control —
    // ignore non-string values so .toLowerCase() doesn't blow up.
    const q = typeof raw === 'string' ? this.normalize(raw) : '';
    if (!q) return list.slice(0, MAX_SUGGESTIONS);
    return list
      .filter((s) => {
        return (
          this.normalize(s.code).includes(q) ||
          this.normalize(s.name).includes(q) ||
          (s.series ? this.normalize(s.series).includes(q) : false)
        );
      })
      .slice(0, MAX_SUGGESTIONS);
  });

  constructor() {
    this.load();

    // Reflect external `value` changes into the input's display text. If
    // the parent assigns an id that's not yet in our local list (e.g. a set
    // that was just created via TCGdex hydration), reload from the service.
    effect(() => {
      const id = this.value();
      const map = this.setsById();
      if (!id) {
        if (this.searchControl.value !== '') {
          this.searchControl.setValue('', { emitEvent: false });
        }
        return;
      }
      const row = map.get(id);
      if (row) {
        const display = this.formatSet(row);
        if (this.searchControl.value !== display) {
          this.searchControl.setValue(display, { emitEvent: false });
        }
      } else if (this.setsList().length > 0) {
        // Have data but missing this id — refetch.
        void this.reload();
      }
    });
  }

  /** Re-fetch sets from the service (call after a sync/create). */
  async reload(): Promise<void> {
    await this.load({ refresh: true });
  }

  private async load(options: { refresh?: boolean } = {}): Promise<void> {
    const rows = await this.sets.list(options);
    this.setsList.set(rows);
  }

  protected displayValue = (set: SetRow | string | null): string => {
    if (!set) return '';
    if (typeof set === 'string') return set;
    return this.formatSet(set);
  };

  protected onSelect(event: MatAutocompleteSelectedEvent): void {
    const row = event.option.value as SetRow;
    this.searchControl.setValue(this.formatSet(row), { emitEvent: false });
    this.valueChange.emit(row.id);
  }

  protected onClear(event: Event): void {
    event.stopPropagation();
    this.searchControl.setValue('', { emitEvent: false });
    this.valueChange.emit(null);
  }

  protected onBlur(): void {
    // If the typed text doesn't match the current value's display, snap back —
    // we don't accept free-text input, only existing sets or null.
    const id = this.value();
    const map = this.setsById();
    if (id && map.has(id)) {
      const display = this.formatSet(map.get(id)!);
      if (this.searchControl.value !== display) {
        this.searchControl.setValue(display, { emitEvent: false });
      }
    } else if (this.searchControl.value !== '') {
      this.searchControl.setValue('', { emitEvent: false });
    }
  }

  protected formatSet(set: SetRow): string {
    return `${set.code} — ${set.name}`;
  }

  protected thumbUrl(set: SetRow): string | null {
    return set.symbol_image_url || null;
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }
}
