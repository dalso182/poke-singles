import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ShippingMethodsService } from '../../core/catalog/shipping-methods.service';
import type { ShippingMethodRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { PillTabs, type TabItem } from '../../shared/table/tabs/pill-tabs/pill-tabs';
import { TableCard } from '../../shared/table/table-card/table-card';
import { EditableInput } from '../../shared/table/controls/editable-input/editable-input';
import { ToggleSwitch } from '../../shared/table/controls/toggle-switch/toggle-switch';
import { LabeledToggle } from '../../shared/table/controls/labeled-toggle/labeled-toggle';
import { Btn } from '../../shared/table/controls/btn/btn';
import { IconBtn } from '../../shared/table/controls/icon-btn/icon-btn';

type ShippingFilter = 'active' | 'inactive' | 'deleted';

@Component({
  selector: 'app-admin-shipping-methods',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTableModule,
    PageHeader,
    PillTabs,
    TableCard,
    EditableInput,
    ToggleSwitch,
    LabeledToggle,
    Btn,
    IconBtn,
  ],
  templateUrl: './shipping-methods.html',
  styleUrl: './shipping-methods.scss',
})
export class ShippingMethods {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShippingMethodsService);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<ShippingMethodRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly addOpen = signal(false);
  protected readonly filter = signal<ShippingFilter>('active');
  protected readonly displayedColumns = [
    'name',
    'description',
    'price',
    'sort_order',
    'requires_address',
    'is_active',
    'actions',
  ];

  protected readonly addForm: FormGroup = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
    requires_address: [true],
  });

  protected readonly editForms = new Map<string, FormGroup>();

  protected readonly visibleRows = computed<ShippingMethodRow[]>(() => {
    const f = this.filter();
    return this.rows().filter((r) => {
      switch (f) {
        case 'active':
          return !r.deleted_at && r.is_active;
        case 'inactive':
          return !r.deleted_at && !r.is_active;
        case 'deleted':
          return !!r.deleted_at;
      }
    });
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    return [
      { key: 'active', label: 'Activos', count: rows.filter((r) => !r.deleted_at && r.is_active).length },
      { key: 'inactive', label: 'Inactivos', count: rows.filter((r) => !r.deleted_at && !r.is_active).length },
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
      this.editForms.clear();
      for (const row of rows) {
        this.editForms.set(
          row.id,
          this.fb.nonNullable.group({
            name: [row.name, Validators.required],
            description: [row.description ?? ''],
            price: [row.price, [Validators.required, Validators.min(0)]],
            sort_order: [row.sort_order, [Validators.required, Validators.min(0)]],
            requires_address: [row.requires_address],
          }),
        );
      }
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected formFor(id: string): FormGroup {
    return this.editForms.get(id)!;
  }

  // Bridges between the FormControls (kept for validation + dirty tracking) and
  // the signal-based EditableInput / ToggleSwitch primitives.
  protected val(id: string, name: string): string {
    return String(this.formFor(id).get(name)!.value ?? '');
  }
  protected boolVal(id: string, name: string): boolean {
    return !!this.formFor(id).get(name)!.value;
  }
  protected setText(id: string, name: string, value: string): void {
    const c = this.formFor(id).get(name)!;
    c.setValue(value);
    c.markAsDirty();
  }
  protected setNum(id: string, name: string, value: string): void {
    const c = this.formFor(id).get(name)!;
    c.setValue(Number(value) || 0);
    c.markAsDirty();
  }
  protected setBool(id: string, name: string, value: boolean): void {
    const c = this.formFor(id).get(name)!;
    c.setValue(value);
    c.markAsDirty();
  }

  protected onFilterChange(next: string): void {
    if (next === 'active' || next === 'inactive' || next === 'deleted') {
      this.filter.set(next);
    }
  }

  protected async onAdd(): Promise<void> {
    if (this.addForm.invalid) return;
    this.saving.set('__new__');
    try {
      const raw = this.addForm.getRawValue();
      await this.service.create({
        name: raw.name.trim(),
        description: raw.description?.trim() || null,
        price: Number(raw.price),
        sort_order: Number(raw.sort_order),
        requires_address: !!raw.requires_address,
      });
      this.addForm.reset({ name: '', description: '', price: 0, sort_order: 0, requires_address: true });
      this.addOpen.set(false);
      await this.refresh();
      this.snack.open('Método de envío creado', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onSave(row: ShippingMethodRow): Promise<void> {
    const form = this.editForms.get(row.id);
    if (!form || form.invalid) return;
    this.saving.set(row.id);
    try {
      const raw = form.getRawValue();
      await this.service.update(row.id, {
        name: raw.name.trim(),
        description: raw.description?.trim() || null,
        price: Number(raw.price),
        sort_order: Number(raw.sort_order),
        requires_address: !!raw.requires_address,
      });
      this.snack.open('Método actualizado', 'OK', { duration: 3000 });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onToggleActive(row: ShippingMethodRow, active: boolean): Promise<void> {
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

  protected async onDelete(row: ShippingMethodRow): Promise<void> {
    this.saving.set(row.id);
    try {
      await this.service.softDelete(row.id);
      await this.refresh();
      this.snack
        .open('Método eliminado', 'Deshacer', { duration: 5000 })
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

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
