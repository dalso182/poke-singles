import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { StaticPagesService } from '../../core/catalog/static-pages.service';
import type { StaticPageRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { SearchInput } from '../../shared/table/controls/search-input/search-input';
import { TableCard } from '../../shared/table/table-card/table-card';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Btn } from '../../shared/table/controls/btn/btn';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';

type PageFilter = 'all' | 'published' | 'unpublished' | 'deleted';

@Component({
  selector: 'app-admin-pages-list',
  imports: [
    DatePipe,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    PillTabs,
    SearchInput,
    TableCard,
    Pill,
    Btn,
    IconBtn,
  ],
  templateUrl: './pages-list.html',
  styleUrl: './pages-list.scss',
})
export class PagesList {
  private readonly service = inject(StaticPagesService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly rows = signal<StaticPageRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly filter = signal<PageFilter>('all');
  protected readonly searchText = signal('');
  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly displayedColumns = ['title', 'slug', 'is_published', 'updated_at', 'actions'];

  protected readonly visibleRows = computed<StaticPageRow[]>(() => {
    const f = this.filter();
    const q = this.searchValue().trim().toLowerCase();
    return this.rows().filter((r) => {
      if (q) {
        const hay = `${r.title} ${r.slug}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (f) {
        case 'all':
          return !r.deleted_at;
        case 'published':
          return !r.deleted_at && r.is_published;
        case 'unpublished':
          return !r.deleted_at && !r.is_published;
        case 'deleted':
          return !!r.deleted_at;
      }
    });
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    const live = rows.filter((r) => !r.deleted_at);
    return [
      { key: 'all', label: 'Todas', count: live.length },
      { key: 'published', label: 'Publicadas', count: live.filter((r) => r.is_published).length },
      { key: 'unpublished', label: 'No publicadas', count: live.filter((r) => !r.is_published).length },
      { key: 'deleted', label: 'Eliminadas', count: rows.filter((r) => !!r.deleted_at).length },
    ];
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

  protected onFilterChange(next: string): void {
    if (next === 'all' || next === 'published' || next === 'unpublished' || next === 'deleted') {
      this.filter.set(next);
    }
  }

  protected goToNew(): void {
    this.router.navigate(['/admin/pages/new']);
  }

  protected goToEdit(id: string): void {
    this.router.navigate(['/admin/pages', id, 'edit']);
  }

  protected async onDelete(row: StaticPageRow): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.softDelete(row.id);
      await this.refresh();
      this.snack
        .open('Página eliminada', 'Deshacer', { duration: 5000 })
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
