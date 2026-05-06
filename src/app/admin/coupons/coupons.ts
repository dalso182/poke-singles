import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CouponsService } from '../../core/catalog/coupons.service';
import type { CouponRow } from '../../core/catalog/catalog.types';

type CouponFilter = 'active' | 'inactive' | 'expired' | 'deleted';

@Component({
  selector: 'app-admin-coupons',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTableModule,
  ],
  templateUrl: './coupons.html',
  styleUrl: './coupons.scss',
})
export class Coupons {
  private readonly service = inject(CouponsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<CouponRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly filter = signal<CouponFilter>('active');
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(200),
      distinctUntilChanged(),
    ),
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
        case 'active':   return !r.deleted_at && r.is_active && !expired;
        case 'inactive': return !r.deleted_at && !r.is_active;
        case 'expired':  return !r.deleted_at && expired;
        case 'deleted':  return !!r.deleted_at;
      }
    });
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

  protected onFilterChange(next: CouponFilter): void {
    if (!['active', 'inactive', 'expired', 'deleted'].includes(next)) return;
    this.filter.set(next);
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
      this.snack.open('Cupón eliminado', 'Deshacer', { duration: 5000 })
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
