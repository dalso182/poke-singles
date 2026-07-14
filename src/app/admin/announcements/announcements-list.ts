import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { AnnouncementsService } from '../../core/catalog/announcements.service';
import type { AnnouncementRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { SearchInput } from '../../shared/table/controls/search-input/search-input';
import { TableCard } from '../../shared/table/table-card/table-card';
import { Pill } from '../../shared/table/cells/pill/pill';
import { Btn } from '../../shared/table/controls/btn/btn';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';

type AnnouncementFilter = 'all' | 'deleted';

@Component({
  selector: 'app-admin-announcements-list',
  imports: [
    DatePipe,
    DecimalPipe,
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
  templateUrl: './announcements-list.html',
  styleUrl: './announcements-list.scss',
})
export class AnnouncementsList {
  private readonly service = inject(AnnouncementsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly rows = signal<AnnouncementRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly filter = signal<AnnouncementFilter>('all');
  protected readonly searchText = signal('');
  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly displayedColumns = [
    'title',
    'is_active',
    'view_count',
    'updated_at',
    'actions',
  ];

  protected readonly visibleRows = computed<AnnouncementRow[]>(() => {
    const f = this.filter();
    const q = this.searchValue().trim().toLowerCase();
    return this.rows().filter((r) => {
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return f === 'deleted' ? !!r.deleted_at : !r.deleted_at;
    });
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    return [
      { key: 'all', label: 'Todos', count: rows.filter((r) => !r.deleted_at).length },
      { key: 'deleted', label: 'Eliminados', count: rows.filter((r) => !!r.deleted_at).length },
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
    if (next === 'all' || next === 'deleted') {
      this.filter.set(next);
    }
  }

  protected goToNew(): void {
    this.router.navigate(['/admin/announcements/new']);
  }

  protected goToEdit(id: string): void {
    this.router.navigate(['/admin/announcements', id, 'edit']);
  }

  /** Activating one deactivates whatever else was active (single-live rule). */
  protected async onToggleActive(row: AnnouncementRow): Promise<void> {
    this.saving.set(row.id);
    try {
      if (row.is_active) {
        await this.service.deactivate(row.id);
        this.snack.open('Anuncio desactivado', 'OK', { duration: 3000 });
      } else {
        await this.service.activate(row.id);
        this.snack.open('Anuncio activado — se mostrará a cada persona una vez', 'OK', {
          duration: 4000,
        });
      }
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onDelete(row: AnnouncementRow): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.softDelete(row.id);
      await this.refresh();
      this.snack
        .open('Anuncio eliminado', 'Deshacer', { duration: 5000 })
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
