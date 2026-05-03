import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SetsService } from '../../core/catalog/sets.service';
import type { SetRow } from '../../core/catalog/catalog.types';
import {
  SetDetailDialog,
  type SetDetailDialogResult,
} from './set-detail-dialog';

interface SeriesGroup {
  readonly series: string | null;
  readonly label: string;
  readonly sets: readonly SetRow[];
}

const NO_SERIES_LABEL = 'Sin serie';

@Component({
  selector: 'app-admin-sets',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './sets.html',
  styleUrl: './sets.scss',
})
export class Sets {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SetsService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  protected readonly rows = signal<SetRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly addOpen = signal(false);
  protected readonly addSaving = signal(false);

  protected readonly addForm: FormGroup = this.fb.nonNullable.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    series: [''],
    release_date: [''],
    symbol_image_url: [''],
  });

  protected readonly grouped = computed<SeriesGroup[]>(() => {
    const map = new Map<string, SetRow[]>();
    const NO_KEY = '__no_series__';
    for (const row of this.rows()) {
      const key = row.series ?? NO_KEY;
      let bucket = map.get(key);
      if (!bucket) {
        bucket = [];
        map.set(key, bucket);
      }
      bucket.push(row);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const da = a.release_date ?? '';
        const db = b.release_date ?? '';
        if (da !== db) return db.localeCompare(da);
        return a.name.localeCompare(b.name);
      });
    }
    const groups: SeriesGroup[] = Array.from(map.entries()).map(
      ([key, sets]) => ({
        series: key === NO_KEY ? null : key,
        label: key === NO_KEY ? NO_SERIES_LABEL : key,
        sets,
      }),
    );
    groups.sort((a, b) => {
      if (a.series === null) return 1;
      if (b.series === null) return -1;
      return a.label.localeCompare(b.label);
    });
    return groups;
  });

  protected readonly totalSets = computed(() => this.rows().length);

  constructor() {
    this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.service.list({ refresh: true });
      this.rows.set(rows);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected async onAdd(): Promise<void> {
    if (this.addForm.invalid) return;
    this.addSaving.set(true);
    try {
      const raw = this.addForm.getRawValue();
      await this.service.create({
        code: raw.code,
        name: raw.name,
        series: raw.series || null,
        release_date: raw.release_date || null,
        symbol_image_url: raw.symbol_image_url || null,
      });
      this.addForm.reset({
        code: '',
        name: '',
        series: '',
        release_date: '',
        symbol_image_url: '',
      });
      this.addOpen.set(false);
      await this.refresh();
      this.snack.open('Set creado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.addSaving.set(false);
    }
  }

  protected openDetail(row: SetRow): void {
    const ref = this.dialog.open<SetDetailDialog, SetRow, SetDetailDialogResult>(
      SetDetailDialog,
      {
        data: row,
        width: '560px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      },
    );
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      if (result.kind === 'updated') {
        this.rows.update((rows) =>
          rows.map((r) => (r.id === result.row.id ? result.row : r)),
        );
      } else if (result.kind === 'deleted') {
        this.rows.update((rows) => rows.filter((r) => r.id !== result.id));
      }
    });
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
