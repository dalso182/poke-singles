import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { StaticPagesService } from '../../core/catalog/static-pages.service';
import type { StaticPageRow } from '../../core/catalog/catalog.types';

type PageFilter = 'all' | 'published' | 'unpublished' | 'deleted';

@Component({
  selector: 'app-admin-pages-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './pages-list.html',
  styleUrl: './pages-list.scss',
})
export class PagesList {
  private readonly service = inject(StaticPagesService);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<StaticPageRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly filter = signal<PageFilter>('all');
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
    ),
    { initialValue: '' },
  );

  protected readonly displayedColumns = [
    'title',
    'slug',
    'is_published',
    'updated_at',
    'actions',
  ];

  protected readonly visibleRows = computed<StaticPageRow[]>(() => {
    const f = this.filter();
    const q = this.searchValue().trim().toLowerCase();
    return this.rows().filter((r) => {
      if (q) {
        const hay = `${r.title} ${r.slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (f) {
        case 'all':         return !r.deleted_at;
        case 'published':   return !r.deleted_at && r.is_published;
        case 'unpublished': return !r.deleted_at && !r.is_published;
        case 'deleted':     return !!r.deleted_at;
      }
    });
  });

  constructor() {
    void this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.service.list({ includeDeleted: true });
      this.rows.set(rows);
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected onFilterChange(next: PageFilter): void {
    if (!['all', 'published', 'unpublished', 'deleted'].includes(next)) return;
    this.filter.set(next);
  }

  protected async onTogglePublished(row: StaticPageRow, published: boolean): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.update(row.id, { is_published: published });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onDelete(row: StaticPageRow): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.softDelete(row.id);
      await this.refresh();
      this.snack.open('Página eliminada', 'Deshacer', { duration: 5000 })
        .onAction()
        .subscribe(() => void this.onRestore(row.id));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onRestore(id: string): Promise<void> {
    try {
      await this.service.restore(id);
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
