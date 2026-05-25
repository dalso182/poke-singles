import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CouponsService } from '../../core/catalog/coupons.service';
import type { CouponRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { TableCard } from '../../shared/table/table-card/table-card';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { SearchInput } from '../../shared/table/controls/search-input/search-input';
import { Money } from '../../shared/table/cells/money-cell/money-cell';
import { ToggleSwitch } from '../../shared/table/controls/toggle-switch/toggle-switch';
import { Btn } from '../../shared/table/controls/btn/btn';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';

type CouponFilter = 'active' | 'inactive' | 'expired' | 'deleted';

@Component({
  selector: 'app-admin-coupons',
  imports: [
    DatePipe,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    TableCard,
    PillTabs,
    SearchInput,
    Money,
    ToggleSwitch,
    Btn,
    IconBtn,
  ],
  templateUrl: './coupons.html',
  styleUrl: './coupons.scss',
})
export class Coupons {
  private readonly service = inject(CouponsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly rows = signal<CouponRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly filter = signal<CouponFilter>('active');
  protected readonly searchText = signal('');
  private readonly searchValue = toSignal(
    toObservable(this.searchText).pipe(debounceTime(200), distinctUntilChanged()),
    { initialValue: '' },
  );

  protected readonly displayedColumns = [
    'code',
    'type',
    'value',
    'min_purchase',
    'expires',
    'max_uses_per_user',
    'is_active',
    'actions',
  ];

  protected readonly visibleRows = computed<CouponRow[]>(() => {
    const f = this.filter();
    const q = this.searchValue().trim().toLowerCase();
    const now = Date.now();
    return this.rows().filter((r) => {
      if (q && !r.code.toLowerCase().includes(q)) return false;
      const expired = new Date(r.expires_at).getTime() <= now;
      switch (f) {
        case 'active':
          return !r.deleted_at && r.is_active && !expired;
        case 'inactive':
          return !r.deleted_at && !r.is_active;
        case 'expired':
          return !r.deleted_at && expired;
        case 'deleted':
          return !!r.deleted_at;
      }
    });
  });

  protected readonly filterTabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    const now = Date.now();
    const isExp = (r: CouponRow) => new Date(r.expires_at).getTime() <= now;
    return [
      { key: 'active', label: 'Activos', count: rows.filter((r) => !r.deleted_at && r.is_active && !isExp(r)).length },
      { key: 'inactive', label: 'Inactivos', count: rows.filter((r) => !r.deleted_at && !r.is_active).length },
      { key: 'expired', label: 'Vencidos', count: rows.filter((r) => !r.deleted_at && isExp(r)).length },
      { key: 'deleted', label: 'Eliminados', count: rows.filter((r) => !!r.deleted_at).length },
    ];
  });

  constructor() {
    this.refresh();
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
    if (next === 'active' || next === 'inactive' || next === 'expired' || next === 'deleted') {
      this.filter.set(next);
    }
  }

  protected goToNew(): void {
    this.router.navigate(['/admin/coupons/new']);
  }

  protected goToEdit(id: string): void {
    this.router.navigate(['/admin/coupons', id, 'edit']);
  }

  protected async onToggleActive(row: CouponRow, active: boolean): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.setActive(row.id, active);
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onDelete(row: CouponRow): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.softDelete(row.id);
      await this.refresh();
      this.snack
        .open('Cupón eliminado', 'Deshacer', { duration: 5000 })
        .onAction()
        .subscribe(() => void this.onRestore(row.id));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  private async onRestore(id: string): Promise<void> {
    try {
      await this.service.restore(id);
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  protected typeLabel(type: CouponRow['type']): string {
    return type === 'PERCENTAGE' ? 'Porcentaje' : 'Monto fijo con mínimo';
  }

  protected isExpired(row: CouponRow): boolean {
    return new Date(row.expires_at).getTime() <= Date.now();
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
