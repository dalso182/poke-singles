import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { CategoriesService } from '../../core/catalog/categories.service';
import type { CategoryRow } from '../../core/catalog/catalog.types';
import { PageHeader } from '../../shared/table/page-header/page-header';
import { TableCard } from '../../shared/table/table-card/table-card';
import { EditableInput } from '../../shared/table/controls/editable-input/editable-input';
import { ToggleSwitch } from '../../shared/table/controls/toggle-switch/toggle-switch';
import { Btn } from '../../shared/table/controls/btn/btn';

@Component({
  selector: 'app-admin-categories',
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
    TableCard,
    EditableInput,
    ToggleSwitch,
    Btn,
  ],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class Categories {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(CategoriesService);
  private readonly snack = inject(MatSnackBar);

  protected readonly rows = signal<CategoryRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal<string | null>(null);
  protected readonly addOpen = signal(false);
  protected readonly displayedColumns = ['slug', 'name', 'sort_order', 'active', 'actions'];

  protected readonly addForm: FormGroup = this.fb.nonNullable.group({
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    name: ['', Validators.required],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editForms = new Map<string, FormGroup>();

  constructor() {
    this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.service.list();
      this.rows.set(rows);
      this.editForms.clear();
      for (const row of rows) {
        this.editForms.set(
          row.id,
          this.fb.nonNullable.group({
            name: [row.name, Validators.required],
            sort_order: [row.sort_order, [Validators.required, Validators.min(0)]],
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

  protected val(id: string, name: string): string {
    return String(this.formFor(id).get(name)!.value ?? '');
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

  protected async onAdd(): Promise<void> {
    if (this.addForm.invalid) return;
    this.saving.set('__new__');
    try {
      await this.service.create(this.addForm.getRawValue());
      this.addForm.reset({ slug: '', name: '', sort_order: 0 });
      this.addOpen.set(false);
      await this.refresh();
      this.snack.open('Categoría creada', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onSave(row: CategoryRow): Promise<void> {
    const form = this.editForms.get(row.id);
    if (!form || form.invalid) return;
    this.saving.set(row.id);
    try {
      await this.service.update(row.id, form.getRawValue());
      this.snack.open('Categoría actualizada', 'OK', { duration: 3000 });
      await this.refresh();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(null);
    }
  }

  protected async onToggleActive(row: CategoryRow, active: boolean): Promise<void> {
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

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
